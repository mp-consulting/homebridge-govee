import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import FakeGatoHistory from 'fakegato-history';
import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';
import storage from 'node-persist';
import PQueue from 'p-queue';

import { AWSClient, BLEClient, HTTPClient, LANClient } from './connection/index.js';
import {
  initializeDeviceHandlers,
  createDeviceInstance,
} from './device/index.js';
import type {
  GoveePluginConfig,
  GoveePlatformAccessory,
  GoveePlatformAccessoryWithControl,
  GoveeAccessoryContext,
  DeviceCommand,
  ExternalUpdateParams,
  BLESensorReading,
  CharacteristicType,
  RawDeviceUpdate,
} from './types.js';
import {
  platformConsts,
  platformLang,
  CustomCharacteristics,
  EveCharacteristics,
} from './utils/index.js';
import { buildTransportCommands } from './connection/commands.js';
import { type AccountCredentials, CredentialStore } from './connection/credentials.js';
import { normaliseDeviceUpdate } from './utils/device-update.js';
import { type DeviceConfigKey, getDeviceTypeFromModel } from './utils/device-types.js';
import {
  hasProperty,
  parseDeviceId,
  parseError,
  pfxToCertAndKey,
} from './utils/functions.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';


// How long each periodic BLE sensor scan listens for advertisements
const BLE_SCAN_WINDOW_MS = 30000;

// Minimum time between forwarding two BLE advertisements from the same sensor
const BLE_READING_THROTTLE_MS = 10000;

// Minimum time between two runtime re-login attempts after the account token is rejected
const REAUTH_MIN_INTERVAL_MS = 10 * 60 * 1000;

// While a leak alert is active, re-check whether it has been read in the Govee app at most this often
const LEAK_RECHECK_MS = 5 * 60 * 1000;

// Commands that set a light's colour mode: a newer one makes any queued older one obsolete
const BLE_COLOUR_COMMANDS = new Set(['color', 'colorTem', 'rgbScene', 'musicMode']);

/**
 * Whether an error means the Govee account token was rejected (as opposed to a network failure)
 */
function isAuthFailure(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403 || (err as Error)?.message === platformLang.noDevices;
}

export interface ExtendedLogging extends Logging {
  debug: (msg: string, ...args: unknown[]) => void;
  debugWarn: (msg: string, ...args: unknown[]) => void;
}

/**
 * Govee Platform Plugin for Homebridge
 */
export class GoveePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly api: API;
  public readonly log: ExtendedLogging;
  public readonly config: GoveePluginConfig;

  // Configuration
  public deviceConf: Record<string, Record<string, unknown>> = {};
  public ignoredDevices: string[] = [];

  // Connection clients
  public awsClient: AWSClient | false = false;
  public bleClient: BLEClient | false = false;
  public httpClient: HTTPClient | false = false;
  public lanClient: LANClient | false = false;

  // Custom characteristics
  public cusChar: Record<string, CharacteristicType> = {};
  public eveChar: Record<string, CharacteristicType> = {};
  public eveService!: ReturnType<typeof FakeGatoHistory>;

  // Storage
  public storageData!: typeof storage;
  public storageClientData = false;

  // Govee account credentials, from the cache or a login
  private credentialStore?: CredentialStore;
  private credentials?: AccountCredentials;

  // Device state (instance-level, not module-level)
  private readonly devicesInHB = new Map<string, GoveePlatformAccessoryWithControl>();
  private readonly awsDevices: string[] = [];
  private readonly httpDevices: Array<Record<string, unknown>> = [];
  private readonly lanDevices: Array<Record<string, unknown>> = [];

  // Plugin state
  private readonly isBeta: boolean;
  private queue!: PQueue;
  private refreshBLEInterval?: ReturnType<typeof setInterval>;
  private refreshHTTPInterval?: ReturnType<typeof setInterval>;
  private refreshAWSInterval?: ReturnType<typeof setInterval>;
  private awsSyncInProgress = false;
  private httpSyncInProgress = false;
  private bleSyncInProgress = false;
  private lastReauth = 0;
  private bleCommandSeq = 0;
  private readonly bleLatestCommand = new Map<string, number>();
  private readonly bleLastReading = new Map<string, number>();
  private readonly leakState = new Map<string, { lastTime: number; checkedAt: number; leak: boolean }>();

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.api = api;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.log = log as ExtendedLogging;
    this.isBeta = !!config.debug;

    // Check Homebridge version
    if (!api.versionGreaterOrEqual?.('1.5.0')) {
      throw new Error(platformLang.hbVersionFail);
    }

    if (!config) {
      throw new Error(platformLang.pluginNotConf);
    }

    // Log environment info
    this.log.info(
      '%s | System %s | Node %s | HB v%s | HAPNodeJS v%s...',
      platformLang.initialising,
      process.platform,
      process.version,
      api.serverVersion,
      api.hap.HAPLibraryVersion(),
    );

    // Apply configuration
    this.config = { ...platformConsts.defaultConfig, ...config } as GoveePluginConfig;
    this.applyUserConfig(config);

    // Set up events
    this.api.on('didFinishLaunching', () => this.pluginSetup());
    this.api.on('shutdown', () => this.pluginShutdown());
  }

  private applyUserConfig(config: PlatformConfig): void {
    // Apply numeric config values
    const numericKeys = ['bleControlInterval', 'bleRefreshTime', 'httpRefreshTime', 'lanRefreshTime', 'lanScanInterval'];
    for (const key of numericKeys) {
      if (key in config) {
        const val = config[key];
        const intVal = Number.parseInt(String(val), 10);
        if (!Number.isNaN(intVal)) {
          const minKey = key as keyof typeof platformConsts.minValues;
          const minVal = platformConsts.minValues[minKey];
          if (intVal >= minVal) {
            (this.config as Record<string, unknown>)[key] = intVal;
          } else {
            this.log.warn('[Config] %s value %d is below minimum %d, using default', key, intVal, minVal);
          }
        }
      }
    }

    // Apply boolean config values
    const booleanKeys = ['awsDisable', 'bleDisable', 'colourSafeMode', 'disableDeviceLogging', 'ignoreMatter', 'lanDisable'];
    for (const key of booleanKeys) {
      if (key in config) {
        (this.config as Record<string, unknown>)[key] = !!config[key];
      }
    }

    // Apply string config values
    if (config.username && typeof config.username === 'string') {
      this.config.username = config.username;
    }
    if (config.password && typeof config.password === 'string') {
      this.config.password = config.password;
    }

    // Apply device configurations
    // Every per-device-type array in the config (lightDevices, kettleDevices, ...)
    const deviceArrayKeys = Object.keys(platformConsts.defaultConfig).filter(key => key.endsWith('Devices'));
    for (const key of deviceArrayKeys) {
      if (Array.isArray(config[key])) {
        for (const deviceConfig of config[key]) {
          if (!deviceConfig.deviceId) {
            continue;
          }
          const id = parseDeviceId(deviceConfig.deviceId);
          if (deviceConfig.ignoreDevice) {
            this.ignoredDevices.push(id);
          }
          this.deviceConf[id] = { ...deviceConfig };
        }
      }
    }
  }

  async pluginSetup(): Promise<void> {
    try {
      this.log.info('%s.', platformLang.initialised);

      // Set up debug logging
      this.log.debug = this.isBeta
        ? ((msg: string, ...args: unknown[]) => this.log.info(msg, ...args))
        : (() => {});
      this.log.debugWarn = this.isBeta
        ? ((msg: string, ...args: unknown[]) => this.log.warn(msg, ...args))
        : (() => {});

      // Initialize custom characteristics
      this.cusChar = new CustomCharacteristics(this.api) as unknown as Record<string, CharacteristicType>;
      this.eveChar = new EveCharacteristics(this.api) as unknown as Record<string, CharacteristicType>;

      // Initialize fakegato-history for Eve app support
      this.eveService = FakeGatoHistory(this.api);

      // Initialize device handlers
      initializeDeviceHandlers();

      // Set up storage
      const cachePath = join(this.api.user.storagePath(), '/govee_cache');
      const persistPath = join(this.api.user.storagePath(), '/persist');

      // Both directories hold account credentials (token, IoT certificate and its password)
      for (const dir of [cachePath, persistPath]) {
        if (!existsSync(dir)) {
          mkdirSync(dir, { mode: 0o700 });
        }
        try {
          chmodSync(dir, 0o700);
        } catch (err) {
          this.log.debugWarn('[Storage] Could not restrict permissions on %s: %s', dir, parseError(err));
        }
      }

      try {
        this.storageData = storage.create({ dir: cachePath, forgiveParseErrors: true }) as typeof storage;
        await this.storageData.init();
        this.storageClientData = true;
      } catch (err) {
        this.log.debugWarn('%s %s.', platformLang.storageSetupErr, parseError(err));
      }

      // Set up clients
      await this.setupLANClient();
      await this.setupHTTPAndAWSClients(persistPath);
      await this.setupBLEClient();

      // Set up command queue
      const bleControlInterval = this.config.bleControlInterval ?? 500;
      const bleInterval = bleControlInterval >= 500
        ? bleControlInterval / 1000
        : bleControlInterval;

      // No queue-level timeout: the BLE client bounds every step of an update itself, and a
      // queue timeout would only reject the caller while the BLE operation kept running and
      // overlapped with the next queued one.
      this.queue = new PQueue({
        concurrency: 1,
        interval: bleInterval * 1000,
        intervalCap: 1,
      });

      // Initialize devices
      await this.initializeDevices();

      this.log.info('%s.', platformLang.complete);
    } catch (err) {
      this.log.warn('***** %s. *****', platformLang.disabling);
      this.log.warn('***** %s. *****', parseError(err));
      this.pluginShutdown();
    }
  }

  private async setupLANClient(): Promise<void> {
    try {
      if (this.config.lanDisable) {
        throw new Error(platformLang.disabledInConfig);
      }
      this.lanClient = new LANClient(this);
      const devices = await this.lanClient.getDevices();
      for (const d of devices) {
        this.lanDevices.push(d as unknown as Record<string, unknown>);
      }
      this.log.info('[LAN] %s.', platformLang.availableWithDevices(devices.length));
    } catch (err) {
      this.log.warn('[LAN] %s %s.', platformLang.disableClient, parseError(err));
      this.lanClient = false;
    }
  }

  private async setupHTTPAndAWSClients(persistPath: string): Promise<void> {
    try {
      this.log.debug('[HTTP] Setting up HTTP and AWS clients...');

      if (!this.config.username || !this.config.password) {
        this.log.debug('[HTTP] No username or password configured');
        throw new Error(platformLang.noCreds);
      }

      this.log.debug('[HTTP] Username: %s', this.config.username);

      const httpClient = new HTTPClient(this);
      this.httpClient = httpClient;
      const store = new CredentialStore(
        this.storageClientData ? this.storageData : undefined,
        this.config.username,
        join(persistPath, 'govee.pfx'),
        this.log,
      );
      this.credentialStore = store;

      this.credentials = await store.load();
      const usedCache = !!this.credentials;
      if (this.credentials) {
        httpClient.setToken(this.credentials.token);
      } else {
        await this.login();
      }

      let devices;
      try {
        devices = await httpClient.getDevices();
      } catch (err) {
        // A cached token can expire or be revoked: discard it and log in again once
        if (!usedCache || !isAuthFailure(err)) {
          throw err;
        }
        this.log.warn('[HTTP] %s', platformLang.accTokenRejected);
        await store.clear();
        await this.login();
        devices = await httpClient.getDevices();
      }
      for (const d of devices) {
        this.httpDevices.push(d as unknown as Record<string, unknown>);
      }
      this.log.info('[HTTP] %s.', platformLang.availableWithDevices(devices.length));

      const creds = this.credentials;
      if (!this.config.awsDisable && creds?.iotPass && creds.topic && creds.accountId) {
        const iotFileData = await pfxToCertAndKey(store.iotFile, creds.iotPass);
        this.awsClient = new AWSClient({
          accountTopic: creds.topic,
          accountId: creds.accountId,
          // Must be unique per connection: AWS IoT drops an existing connection with the same id
          clientId: httpClient.clientId,
          iotEndpoint: creds.endpoint,
          log: this.log,
          receiveUpdateAWS: (payload) => this.receiveUpdateAWS(payload as Record<string, unknown>),
        }, iotFileData);
        this.log.info('[AWS] %s.', platformLang.available);
      }
    } catch (err) {
      this.log.warn('[HTTP] %s %s.', platformLang.disableClient, parseError(err));
      this.httpClient = false;
      this.awsClient = false;
    }
  }

  /**
   * Log in to the Govee account and persist the result
   */
  private async login(): Promise<void> {
    if (!this.httpClient || !this.credentialStore) {
      return;
    }
    const data = await this.httpClient.login();
    this.credentials = {
      topic: data.topic,
      token: data.token,
      accountId: data.accountId,
      endpoint: data.endpoint,
      iotPass: data.iotPass,
    };
    await this.credentialStore.save(this.credentials, data.iot);
  }

  /**
   * Re-login at runtime after the account token was rejected, at most once per REAUTH_MIN_INTERVAL_MS
   */
  private async reauthenticate(): Promise<void> {
    if (!this.httpClient || !this.credentialStore || Date.now() - this.lastReauth < REAUTH_MIN_INTERVAL_MS) {
      return;
    }
    this.lastReauth = Date.now();
    this.log.warn('[HTTP] %s', platformLang.accTokenRejected);
    try {
      await this.credentialStore.clear();
      await this.login();
    } catch (err) {
      this.log.warn('[HTTP] %s %s.', platformLang.syncFail, parseError(err));
    }
  }

  private async setupBLEClient(): Promise<void> {
    try {
      if (this.config.bleDisable) {
        throw new Error(platformLang.disabledInConfig);
      }
      if (['linux', 'freebsd', 'win32'].includes(process.platform)) {
        const { default: BluetoothHciSocket } = await import('@stoprocent/bluetooth-hci-socket');
        const socket = new BluetoothHciSocket();
        const device = process.env.NOBLE_HCI_DEVICE_ID ? Number.parseInt(process.env.NOBLE_HCI_DEVICE_ID, 10) : 0;
        socket.bindRaw(device);
      }
      await import('@stoprocent/noble');
      this.bleClient = new BLEClient(this);
      this.log.info('[BLE] %s.', platformLang.available);
    } catch (err) {
      const errorMsg = parseError(err);
      if (errorMsg.includes('Address family not supported')) {
        this.log.warn('[BLE] disabled - Bluetooth not available on this system (no hardware or driver support).');
      } else {
        this.log.warn('[BLE] %s %s.', platformLang.disableClient, errorMsg);
      }
      this.bleClient = false;
    }
  }

  /**
   * Store discovered devices in storage for UI auto-population
   */
  private async storeDiscoveredDevices(): Promise<void> {
    if (!this.storageClientData) {
      this.log.debug('[Storage] Storage not available, skipping device storage');
      return;
    }

    try {
      // Combine HTTP and LAN devices
      const allDevices: Array<{
        deviceId: string;
        deviceName: string;
        model: string;
        deviceType: DeviceConfigKey;
        ip?: string;
        goodsType?: number;
        pactType?: number;
        pactCode?: number;
        versionSoft?: string;
        versionHard?: string;
      }> = [];

      // Process HTTP devices
      for (const httpDevice of this.httpDevices) {
        let deviceId = httpDevice.device as string;
        if (!deviceId.includes(':')) {
          deviceId = deviceId.replace(/([a-z0-9]{2})(?=[a-z0-9])/gi, '$&:').toUpperCase();
        }
        const model = httpDevice.sku as string;
        const deviceName = httpDevice.deviceName as string;
        const deviceType = getDeviceTypeFromModel(model);

        // Include the LAN IP address if this device was also found on the local network,
        // so the UI device picker can pre-fill it (useful for cross-VLAN setups)
        const ip = this.lanDevices.find(el => el.device === deviceId)?.ip as string | undefined;

        // Carry Govee's product identifiers through to the config UI: the scene, DIY
        // and capability endpoints all require goodsType, and the UI has no other way
        // to obtain it without a fresh login.
        allDevices.push({
          deviceId,
          deviceName,
          model,
          deviceType,
          ip,
          goodsType: httpDevice.goodsType as number | undefined,
          pactType: httpDevice.pactType as number | undefined,
          pactCode: httpDevice.pactCode as number | undefined,
          versionSoft: httpDevice.versionSoft as string | undefined,
          versionHard: httpDevice.versionHard as string | undefined,
        });
      }

      // Process LAN-only devices
      for (const lanDevice of this.lanDevices) {
        const deviceId = lanDevice.device as string;
        // Skip if already added from HTTP
        if (allDevices.some(d => d.deviceId === deviceId)) {
          continue;
        }
        const model = (lanDevice.sku as string) || 'HXXXX';
        const deviceName = this.deviceConf[deviceId]?.label as string || deviceId.replaceAll(':', '');
        const deviceType = getDeviceTypeFromModel(model);

        allDevices.push({ deviceId, deviceName, model, deviceType, ip: lanDevice.ip as string | undefined });
      }

      // Store for UI to read
      await this.storageData.setItem('Govee_Discovered_Devices', JSON.stringify(allDevices));
      this.log.debug('[Storage] Stored %d discovered devices for UI', allDevices.length);
    } catch (err) {
      this.log.warn('[Storage] Failed to store discovered devices: %s', parseError(err));
    }
  }

  private async initializeDevices(): Promise<void> {
    let lanDevicesInitialised = false;
    let httpDevicesInitialised = false;
    const skippedLanDevices = new Set<string>();

    // Store discovered devices for UI auto-population
    await this.storeDiscoveredDevices();

    for (const httpDevice of this.httpDevices) {
      let deviceId = httpDevice.device as string;
      if (!deviceId.includes(':')) {
        deviceId = deviceId.replace(/([a-z0-9]{2})(?=[a-z0-9])/gi, '$&:').toUpperCase();
        httpDevice.device = deviceId;
      }

      const model = httpDevice.sku as string;
      if (this.isIgnored(deviceId, model)) {
        continue;
      }

      const lanDevice = this.lanDevices.find(el => el.device === deviceId);

      if (lanDevice) {
        this.initialiseDevice({ ...lanDevice, httpInfo: httpDevice, model, deviceName: httpDevice.deviceName, isLanDevice: true });
        lanDevicesInitialised = true;
        (lanDevice as Record<string, unknown>).initialised = true;
      } else {
        this.initialiseDevice({ device: deviceId, deviceName: httpDevice.deviceName, model, httpInfo: httpDevice });
      }
      httpDevicesInitialised = true;
    }

    for (const lanDevice of this.lanDevices.filter(el => !(el as Record<string, unknown>).initialised)) {
      const deviceId = lanDevice.device as string;
      if (this.isIgnored(deviceId, lanDevice.sku as string | undefined)) {
        continue;
      }
      // LAN discovery is unauthenticated, so when the account device list is available only
      // devices from that list, or ones the user configured explicitly, become accessories
      if (this.httpClient && !this.deviceConf[deviceId]) {
        this.log.info('[LAN] %s [%s].', platformLang.lanUnknownSkipped, deviceId);
        skippedLanDevices.add(deviceId);
        continue;
      }
      this.initialiseDevice({
        device: deviceId,
        deviceName: this.deviceConf[deviceId]?.label as string || deviceId.replaceAll(':', ''),
        model: (lanDevice.sku as string) || 'HXXXX',
        isLanDevice: true,
        isLanOnly: true,
      });
      lanDevicesInitialised = true;
    }

    if (!lanDevicesInitialised && !httpDevicesInitialised) {
      throw new Error(platformLang.noDevs);
    }

    this.devicesInHB.forEach((accessory) => {
      const deviceId = accessory.context.gvDeviceId;
      if (
        (!this.httpDevices.some(el => el.device === deviceId) && !this.lanDevices.some(el => el.device === deviceId)) ||
        this.isIgnored(deviceId, accessory.context.gvModel) ||
        skippedLanDevices.has(deviceId)
      ) {
        this.removeAccessory(accessory);
      }
    });

    if (this.awsClient && this.awsDevices.length > 0) {
      // The subscription only completes once the broker is reachable, which may be never
      // (firewall, revoked certificate), so it must not hold up the rest of the setup
      this.awsClient.connect()
        .then(() => this.goveeAWSSync())
        .catch(err => this.log.warn('[AWS] %s %s.', platformLang.disableClient, parseError(err)));
      this.refreshAWSInterval = setInterval(() => this.goveeAWSSync(), 60000);
    }

    // Leak, thermo-hygrometer, and air quality monitor sensors report readings via the
    // HTTP device list, so poll it periodically if any such devices are initialised
    if (this.httpClient) {
      const httpSensorModels = [
        ...platformConsts.models.sensorLeak,
        ...platformConsts.models.sensorThermo,
        ...platformConsts.models.sensorMonitor,
      ];
      const hasHttpSensors = [...this.devicesInHB.values()].some(acc => httpSensorModels.includes(acc.context.gvModel));
      if (hasHttpSensors) {
        this.goveeHTTPSync();
        this.refreshHTTPInterval = setInterval(
          () => this.goveeHTTPSync(),
          (this.config.httpRefreshTime ?? platformConsts.defaultValues.httpRefreshTime) * 1000,
        );
      }
    }

    if (lanDevicesInitialised && this.lanClient) {
      this.lanClient.startDevicesPolling();
      this.lanClient.startStatusPolling();
    }

    // Thermo-hygrometers broadcast their readings over BLE, so scan for them periodically
    if (this.bleClient && [...this.devicesInHB.values()].some(acc => this.isBLESensor(acc))) {
      this.goveeBLESync();
      this.refreshBLEInterval = setInterval(
        () => this.goveeBLESync(),
        (this.config.bleRefreshTime ?? platformConsts.defaultValues.bleRefreshTime) * 1000,
      );
    }
  }

  /**
   * Devices the user excluded: individually (ignoreDevice), or every Matter-capable model
   * when ignoreMatter is set (they can be added to HomeKit natively instead)
   */
  private isIgnored(deviceId: string, model?: string): boolean {
    return this.ignoredDevices.includes(deviceId)
      || (!!this.config.ignoreMatter && !!model && platformConsts.matterModels.includes(model.toUpperCase()));
  }

  private isBLESensor(accessory: GoveePlatformAccessoryWithControl): boolean {
    const { gvModel, bleAddress } = accessory.context;
    return !!bleAddress && (
      platformConsts.models.sensorThermo.includes(gvModel) || platformConsts.models.sensorThermo4.includes(gvModel)
    );
  }

  pluginShutdown(): void {
    // Destroy all device handlers (clears intervals, timers, listeners)
    for (const accessory of this.devicesInHB.values()) {
      this.safely('destroy', () => accessory.control?.destroy?.(), accessory.displayName);
    }

    for (const interval of [this.refreshBLEInterval, this.refreshHTTPInterval, this.refreshAWSInterval]) {
      if (interval) {
        clearInterval(interval);
      }
    }

    // Each client is torn down independently so one failure doesn't leave the others running
    if (this.awsClient) {
      const awsClient = this.awsClient;
      this.safely('AWS shutdown', () => awsClient.disconnect());
    }
    if (this.lanClient) {
      const lanClient = this.lanClient;
      this.safely('LAN shutdown', () => lanClient.close());
    }
    if (this.bleClient) {
      const bleClient = this.bleClient;
      this.safely('BLE shutdown', () => bleClient.shutdown());
    }
  }

  private safely(step: string, fn: () => void, name = 'Shutdown'): void {
    try {
      fn();
    } catch (err) {
      this.log.warn('[%s] %s error: %s', name, step, parseError(err));
    }
  }

  applyAccessoryLogging(accessory: GoveePlatformAccessoryWithControl): void {
    if (this.config.disableDeviceLogging) {
      accessory.log = () => {};
      accessory.logWarn = () => {};
    } else {
      accessory.log = (msg: string) => this.log.info('[%s] %s.', accessory.displayName, msg);
      accessory.logWarn = (msg: string) => this.log.warn('[%s] %s.', accessory.displayName, msg);
    }
    accessory.logDebug = () => {};
    accessory.logDebugWarn = () => {};
  }

  initialiseDevice(device: Record<string, unknown>): void {
    try {
      const deviceId = device.device as string;
      const model = device.model as string;
      const deviceName = device.deviceName as string;
      const uuid = this.api.hap.uuid.generate(deviceId);

      this.log.debug('[Init] Device %s, UUID: %s, cached: %s', deviceName, uuid, this.devicesInHB.has(uuid));

      let accessory = this.devicesInHB.get(uuid);
      if (!accessory) {
        accessory = this.addAccessory({ device: deviceId, deviceName, model });
      }
      if (!accessory) {
        throw new Error(platformLang.accNotFound);
      }

      this.applyAccessoryLogging(accessory);

      accessory.context.gvDeviceId = deviceId;
      accessory.context.gvModel = model;
      accessory.context.hasLanControl = !!device.isLanDevice;
      accessory.context.useLanControl = accessory.context.hasLanControl;
      accessory.context.hasAwsControl = false;
      accessory.context.useAwsControl = false;
      accessory.context.hasBleControl = false;
      accessory.context.useBleControl = false;

      const httpInfo = device.httpInfo as Record<string, unknown> | undefined;
      if (typeof httpInfo?.goodsType === 'number') {
        accessory.context.goodsType = httpInfo.goodsType;
      }
      if (httpInfo?.deviceExt) {
        const deviceExt = httpInfo.deviceExt as Record<string, unknown>;
        if (deviceExt.deviceSettings) {
          try {
            const parsed = JSON.parse(deviceExt.deviceSettings as string);
            if (parsed?.topic) {
              accessory.context.hasAwsControl = true;
              accessory.context.awsTopic = parsed.topic;
              if (this.awsClient) {
                accessory.context.useAwsControl = true;
                this.awsDevices.push(deviceId);
              }
            }
            if (parsed?.bleName) {
              accessory.context.hasBleControl = true;
              accessory.context.bleAddress = parsed.address?.toLowerCase() || deviceId.substring(6).toLowerCase();
              if (this.bleClient) {
                accessory.context.useBleControl = true;
              }
            }
          } catch {
            this.log.debugWarn('[%s] Failed to parse deviceSettings, skipping AWS/BLE setup', deviceName);
          }
        }
      }

      const instance = createDeviceInstance(model, this, accessory);
      if (instance) {
        accessory.control = instance;
        this.log.info('[%s] %s [%s] [%s].', accessory.displayName, platformLang.devInit, deviceId, model);
      } else {
        this.log.warn('[%s] %s [%s]', deviceName, platformLang.devMaySupp, model);
        return;
      }

      this.api.updatePlatformAccessories([accessory]);
      this.devicesInHB.set(accessory.UUID, accessory);
    } catch (err) {
      this.log.warn('[%s] %s %s.', device.deviceName, platformLang.devNotInit, parseError(err));
    }
  }

  addAccessory(device: { device: string; deviceName: string; model: string }): GoveePlatformAccessoryWithControl | undefined {
    try {
      const uuid = this.api.hap.uuid.generate(device.device);

      // Check if the accessory is already cached (might have been restored from a different UUID)
      // This can happen if the device ID format changed between runs
      for (const [existingUuid, existingAccessory] of this.devicesInHB) {
        if (existingAccessory.context?.gvDeviceId === device.device) {
          this.log.debug('[%s] Found existing accessory with matching device ID (different UUID: %s vs %s)', device.deviceName, existingUuid, uuid);
          return existingAccessory;
        }
      }

      const accessory = new this.api.platformAccessory(device.deviceName, uuid) as unknown as GoveePlatformAccessoryWithControl;

      // Apply default logging methods
      this.applyAccessoryLogging(accessory);

      accessory.getService(this.api.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.api.hap.Characteristic.Name, device.deviceName)
        .setCharacteristic(this.api.hap.Characteristic.Manufacturer, platformLang.brand)
        .setCharacteristic(this.api.hap.Characteristic.SerialNumber, device.device)
        .setCharacteristic(this.api.hap.Characteristic.Model, device.model);

      accessory.context = { gvDeviceId: device.device, gvModel: device.model } as GoveeAccessoryContext;
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.configureAccessory(accessory as PlatformAccessory);
      this.log.info('[%s] %s.', device.deviceName, platformLang.devAdd);
      return accessory;
    } catch (err) {
      this.log.warn('[%s] %s %s.', device.deviceName, platformLang.devNotAdd, parseError(err));
      return undefined;
    }
  }

  configureAccessory(accessory: PlatformAccessory): void {
    const acc = accessory as unknown as GoveePlatformAccessoryWithControl;
    // Apply default logging methods for restored accessories
    if (!acc.log) {
      acc.log = (msg: string) => this.log.info('[%s] %s.', acc.displayName, msg);
      acc.logWarn = (msg: string) => this.log.warn('[%s] %s.', acc.displayName, msg);
      acc.logDebug = () => {};
      acc.logDebugWarn = () => {};
    }
    this.log.debug('[Restored] %s (UUID: %s)', acc.displayName, accessory.UUID);
    this.devicesInHB.set(accessory.UUID, acc);
  }

  removeAccessory(accessory: GoveePlatformAccessory): void {
    try {
      // Clean up device handler resources before removal
      this.devicesInHB.get(accessory.UUID)?.control?.destroy?.();

      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.devicesInHB.delete(accessory.UUID);
      this.log.info('[%s] %s.', accessory.displayName, platformLang.devRemove);
    } catch (err) {
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.devNotRemove, parseError(err));
    }
  }

  async goveeHTTPSync(): Promise<void> {
    if (!this.httpClient) {
      return;
    }
    if (this.httpSyncInProgress) {
      this.log.debug('[HTTP] Sync already in progress, skipping this cycle');
      return;
    }
    this.httpSyncInProgress = true;
    try {
      const devices = await this.httpClient.getDevices();
      const httpSensorModels = [
        ...platformConsts.models.sensorLeak,
        ...platformConsts.models.sensorThermo,
        ...platformConsts.models.sensorMonitor,
      ];
      for (const device of devices.filter(el => httpSensorModels.includes(el.sku))) {
        try {
          let deviceId = device.device;
          if (!deviceId.includes(':')) {
            deviceId = deviceId.replace(/([a-z0-9]{2})(?=[a-z0-9])/gi, '$&:').toUpperCase();
          }

          const accessory = this.devicesInHB.get(this.api.hap.uuid.generate(deviceId));
          if (!accessory) {
            continue;
          }

          if (!device.deviceExt?.deviceSettings || !device.deviceExt.lastDeviceData) {
            continue;
          }

          let parsedSettings: Record<string, unknown>;
          let parsedData: Record<string, unknown>;
          try {
            parsedSettings = JSON.parse(device.deviceExt.deviceSettings);
            parsedData = JSON.parse(device.deviceExt.lastDeviceData);
          } catch {
            continue;
          }

          const toReturn: ExternalUpdateParams = { source: 'HTTP' };
          if (platformConsts.models.sensorLeak.includes(device.sku)) {
            accessory.logDebug?.(`[HTTP] raw sensor data: ${JSON.stringify({ ...parsedData, ...parsedSettings })}`);

            const hasUnreadLeak = await this.checkLeakAlerts(accessory, deviceId, device.sku, Number(parsedData.lastTime) || 0);

            if (hasProperty(parsedSettings, 'battery')) {
              toReturn.battery = parsedSettings.battery as number;
            }
            toReturn.leakDetected = hasUnreadLeak;
            if (hasProperty(parsedData, 'online')) {
              toReturn.online = !!(parsedData.gwonline && parsedData.online);
            }
          } else {
            // Thermo-hygrometer and air quality sensors report readings in hundredths,
            // converted by the device handler. A value of 65535 is Govee's sentinel for
            // "no reading / sensor not fitted" (e.g. the H5310 pool sensor has no
            // humidity sensor) and must not be forwarded.
            accessory.logDebug?.(`[HTTP] raw sensor data: ${JSON.stringify(parsedData)}`);

            if (hasProperty(parsedSettings, 'battery')) {
              toReturn.battery = parsedSettings.battery as number;
            }
            if (hasProperty(parsedData, 'tem') && (parsedData.tem as number) !== 65535) {
              toReturn.temperature = parsedData.tem as number;
            }
            if (hasProperty(parsedData, 'hum') && (parsedData.hum as number) !== 65535) {
              toReturn.humidity = parsedData.hum as number;
            }
            if (hasProperty(parsedData, 'pm25') && (parsedData.pm25 as number) !== 65535) {
              toReturn.pm25 = parsedData.pm25 as number;
            }
            if (hasProperty(parsedData, 'online')) {
              toReturn.online = parsedData.online as boolean;
            }
          }

          this.receiveDeviceUpdate(accessory, toReturn);
        } catch (err) {
          this.log.warn('[%s] %s %s.', device.deviceName, platformLang.devNotRef, parseError(err));
        }
      }
    } catch (err) {
      this.log.warn('[HTTP] %s %s.', platformLang.syncFail, parseError(err));
      if (isAuthFailure(err)) {
        await this.reauthenticate();
      }
    } finally {
      this.httpSyncInProgress = false;
    }
  }

  /**
   * A leak is considered detected while any unread leakage alert exists. The alert list is a
   * separate request, so only fetch it when the sensor reports a new event (`lastTime` changed),
   * or periodically while an alert is active to notice it being read in the Govee app.
   */
  private async checkLeakAlerts(
    accessory: GoveePlatformAccessoryWithControl,
    deviceId: string,
    sku: string,
    lastTime: number,
  ): Promise<boolean> {
    if (!this.httpClient || lastTime <= 0) {
      return false;
    }
    const cached = this.leakState.get(deviceId);
    const now = Date.now();
    if (cached && cached.lastTime === lastTime && (!cached.leak || now - cached.checkedAt < LEAK_RECHECK_MS)) {
      return cached.leak;
    }
    try {
      const msgs = await this.httpClient.getLeakDeviceWarning(deviceId, sku) as Array<Record<string, unknown>>;
      accessory.logDebug?.(`[HTTP] raw messages: ${JSON.stringify(msgs)}`);
      const leak = msgs.some(
        msg => !msg.read && String(msg.message).toLowerCase().replaceAll(/\s+/g, '').startsWith('leakagealert'),
      );
      this.leakState.set(deviceId, { lastTime, checkedAt: now, leak });
      return leak;
    } catch (err) {
      // Keep the last known state rather than clearing an active alert on a transient failure,
      // and wait a full recheck interval before retrying
      accessory.logDebugWarn?.(`[HTTP] ${platformLang.syncFail} ${parseError(err)}`);
      const leak = cached?.leak ?? false;
      this.leakState.set(deviceId, { lastTime: cached?.lastTime ?? lastTime, checkedAt: now, leak });
      return leak;
    }
  }

  async goveeBLESync(): Promise<void> {
    if (!this.bleClient || this.bleSyncInProgress) {
      return;
    }
    this.bleSyncInProgress = true;
    try {
      await this.bleClient.scanFor(reading => this.receiveBLEReading(reading), BLE_SCAN_WINDOW_MS);
    } catch (err) {
      this.log.debugWarn('[BLE] %s %s.', platformLang.syncFail, parseError(err));
    } finally {
      this.bleSyncInProgress = false;
    }
  }

  receiveBLEReading(reading: BLESensorReading): void {
    const address = reading.address?.toLowerCase();
    if (!address) {
      return;
    }
    // Sensors advertise several times a second while scanning
    const now = Date.now();
    if (now - (this.bleLastReading.get(address) ?? 0) < BLE_READING_THROTTLE_MS) {
      return;
    }
    for (const accessory of this.devicesInHB.values()) {
      if (accessory.context.bleAddress === address && this.isBLESensor(accessory)) {
        this.bleLastReading.set(address, now);
        // Handlers expect HTTP-style readings in hundredths
        this.receiveDeviceUpdate(accessory, {
          source: 'BLE',
          battery: reading.battery,
          temperature: Math.round(reading.tempInC * 100),
          humidity: Math.round(reading.humidity * 100),
        });
      }
    }
  }

  async goveeAWSSync(): Promise<void> {
    if (this.awsDevices.length === 0 || !this.awsClient) {
      return;
    }
    if (this.awsSyncInProgress) {
      this.log.debug('[AWS] Sync already in progress, skipping this cycle');
      return;
    }
    this.awsSyncInProgress = true;
    try {
      for (const deviceId of this.awsDevices) {
        const accessory = this.devicesInHB.get(this.api.hap.uuid.generate(deviceId));
        if (accessory) {
          try {
            await this.awsClient.requestUpdate(accessory);
          } catch (err) {
            accessory.logDebugWarn?.(`[AWS] ${platformLang.syncFail} ${parseError(err)}`);
          }
        }
      }
    } finally {
      this.awsSyncInProgress = false;
    }
  }

  async sendDeviceUpdate(accessory: GoveePlatformAccessoryWithControl, params: DeviceCommand): Promise<boolean> {
    const deviceConf = this.deviceConf[accessory.context.gvDeviceId] ?? {};
    const model = (accessory.context.gvModel ?? '').toUpperCase();

    const data = buildTransportCommands(params, model, deviceConf);

    if (accessory.context.useLanControl && data.lanParams && this.lanClient) {
      try {
        await this.lanClient.updateDevice(accessory, data.lanParams);
        return true;
      } catch (err) {
        accessory.logWarn?.(`${platformLang.notLANSent} ${parseError(err)}`);
      }
    }

    if (accessory.context.useAwsControl && data.awsParams && this.awsClient) {
      try {
        await this.awsClient.updateDevice(accessory, data.awsParams);
        return true;
      } catch (err) {
        accessory.logWarn?.(`${platformLang.notAWSSent} ${parseError(err)}`);
      }
    }

    // Commands without a BLE form have nowhere else to go: report the failure to HomeKit
    // rather than letting it show a state the device never received
    if (!data.bleParams) {
      throw new Error(platformLang.noConnMethod);
    }

    // BLE commands are slow and rate-limited, so a newer command of the same kind for the
    // same device makes a still-queued older one obsolete (e.g. dragging a slider)
    const kind = BLE_COLOUR_COMMANDS.has(params.cmd) ? 'colour' : params.cmd;
    const coalesceKey = kind === 'ptReal' ? undefined : `${accessory.context.gvDeviceId}:${kind}`;
    const seq = ++this.bleCommandSeq;
    if (coalesceKey) {
      this.bleLatestCommand.set(coalesceKey, seq);
    }

    return this.queue.add(async () => {
      if (coalesceKey) {
        if (this.bleLatestCommand.get(coalesceKey) !== seq) {
          return true;
        }
        this.bleLatestCommand.delete(coalesceKey);
      }
      if (accessory.context.useBleControl && data.bleParams && this.bleClient) {
        try {
          await this.bleClient.updateDevice(accessory, data.bleParams);
          return true;
        } catch (err) {
          accessory.logDebugWarn?.(`${platformLang.notBLESent} ${parseError(err)}`);
        }
      }
      throw new Error(platformLang.noConnMethod);
    });
  }

  receiveUpdateLAN(accessoryId: string, params: Record<string, unknown>, ipAddress: string): void {
    this.devicesInHB.forEach((accessory) => {
      if (accessory.context.gvDeviceId === accessoryId) {
        if (!accessory.context.useLanControl) {
          accessory.context.hasLanControl = true;
          accessory.context.useLanControl = true;
        }
        if (accessory.context.ipAddress !== ipAddress) {
          accessory.context.ipAddress = ipAddress;
          accessory.log?.(`[LAN] ${platformLang.curIP} [${ipAddress}]`);
        }
        if (Object.keys(params).length > 0) {
          // LAN status replies are { onOff, brightness, color, colorTemInKelvin }
          this.receiveDeviceUpdate(accessory, { ...params, source: 'LAN' });
        }
      }
    });
  }

  receiveUpdateAWS(payload: Record<string, unknown>): void {
    const accessory = this.devicesInHB.get(this.api.hap.uuid.generate(payload.device as string));
    if (accessory) {
      this.receiveDeviceUpdate(accessory, { ...payload, source: 'AWS' } as RawDeviceUpdate);
    }
  }

  receiveDeviceUpdate(accessory: GoveePlatformAccessoryWithControl, params: RawDeviceUpdate): void {
    if (!accessory?.control?.externalUpdate) {
      return;
    }

    const data = normaliseDeviceUpdate(params, accessory.context.gvModel);
    if (Object.keys(data).length <= 1) {
      return;
    }

    const onError = (err: unknown) =>
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.devNotUpdated, parseError(err));
    try {
      // Some handlers are async: catch their rejections too
      Promise.resolve(accessory.control.externalUpdate(data)).catch(onError);
    } catch (err) {
      onError(err);
    }
  }

  updateAccessoryStatus(accessory: GoveePlatformAccessoryWithControl, online: boolean): void {
    accessory.log?.(`Device is ${online ? 'online' : 'offline'}`);
  }
}

