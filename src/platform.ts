import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, promises } from 'node:fs';
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
  AWSParams,
  BLEParams,
  LANParams,
} from './types.js';
import { k2rgb } from './utils/colour.js';
import {
  platformConsts,
  platformLang,
  CustomCharacteristics,
  EveCharacteristics,
} from './utils/index.js';
import {
  base64ToHex,
  hasProperty,
  parseDeviceId,
  parseError,
  pfxToCertAndKey,
} from './utils/functions.js';

const PLUGIN_NAME = '@mp-consulting/homebridge-govee';
export const PLATFORM_NAME = 'Govee';

// Global state
const devicesInHB = new Map<string, GoveePlatformAccessoryWithControl>();
const awsDevices: string[] = [];
const awsDevicesToPoll: string[] = [];
const httpDevices: Array<Record<string, unknown>> = [];
const lanDevices: Array<Record<string, unknown>> = [];

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
  public cusChar: Record<string, typeof Characteristic> = {};
  public eveChar: Record<string, typeof Characteristic> = {};
  public eveService!: ReturnType<typeof FakeGatoHistory>;

  // Storage
  public storageData!: typeof storage;
  public storageClientData = false;

  // AWS connection info
  public accountTopic?: string;
  public accountToken?: string;
  public accountId?: string;
  public accountTokenTTR?: string;
  public clientId?: string;
  public iotEndpoint?: string;
  public iotPass?: string;

  // Plugin state
  private readonly isBeta: boolean;
  private queue!: PQueue;
  private refreshBLEInterval?: ReturnType<typeof setInterval>;
  private refreshHTTPInterval?: ReturnType<typeof setInterval>;
  private refreshAWSInterval?: ReturnType<typeof setInterval>;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.api = api;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.log = log as ExtendedLogging;
    this.isBeta = false;

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
          if (intVal >= platformConsts.minValues[minKey]) {
            (this.config as Record<string, unknown>)[key] = intVal;
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
    const deviceArrayKeys = [
      'lightDevices', 'switchDevices', 'fanDevices', 'heaterDevices',
      'humidifierDevices', 'purifierDevices', 'thermoDevices', 'leakDevices',
    ];
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
      this.cusChar = new CustomCharacteristics(this.api) as unknown as Record<string, typeof Characteristic>;
      this.eveChar = new EveCharacteristics(this.api) as unknown as Record<string, typeof Characteristic>;

      // Initialize fakegato-history for Eve app support
      this.eveService = FakeGatoHistory(this.api);

      // Initialize device handlers
      initializeDeviceHandlers();

      // Set up storage
      const cachePath = join(this.api.user.storagePath(), '/bwp91_cache');
      const persistPath = join(this.api.user.storagePath(), '/persist');

      if (!existsSync(cachePath)) {
        mkdirSync(cachePath);
      }
      if (!existsSync(persistPath)) {
        mkdirSync(persistPath);
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.storageData = (storage as any).create({ dir: cachePath, forgiveParseErrors: true });
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

      this.queue = new PQueue({
        concurrency: 1,
        interval: bleInterval * 1000,
        intervalCap: 1,
        timeout: 10000,
      });

      // Initialize devices
      await this.initializeDevices();

      this.log.info('%s. %s', platformLang.complete, platformLang.welcome);
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
        lanDevices.push(d as unknown as Record<string, unknown>);
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

      const iotFile = join(persistPath, 'govee.pfx');
      this.httpClient = new HTTPClient(this);

      try {
        this.log.debug('[HTTP] Checking for cached credentials...');
        const storedData = await this.storageData.getItem('Govee_All_Devices_temp');
        const splitData = storedData?.split(':::');
        if (!Array.isArray(splitData) || splitData.length !== 7) {
          throw new Error(platformLang.accTokenNoExist);
        }
        if (splitData[2] !== this.config.username) {
          throw new Error(platformLang.accTokenUserChange);
        }
        await promises.access(iotFile, 0);

        [this.accountTopic, this.accountToken, , this.accountId, this.iotEndpoint, this.iotPass, this.accountTokenTTR] = splitData;
        // Set the token on the HTTP client from cache
        this.httpClient.setToken(this.accountToken!, this.accountTokenTTR);
        this.log.debug('[HTTP] %s.', platformLang.accTokenFromCache);
      } catch (cacheErr) {
        this.log.debug('[HTTP] Cache not available (%s), performing fresh login...', parseError(cacheErr));
        const data = await this.httpClient.login();
        this.accountId = data.accountId;
        this.accountTopic = data.topic;
        this.iotEndpoint = data.endpoint;
        this.iotPass = data.iotPass;

        await promises.writeFile(iotFile, Buffer.from(data.iot, 'base64'));
        try {
          await this.storageData.setItem(
            'Govee_All_Devices_temp',
            `${this.accountTopic}:::${data.token}:::${this.config.username}:::${this.accountId}:::${this.iotEndpoint}:::${this.iotPass}:::${data.tokenTTR}`,
          );
        } catch (e) {
          this.log.warn('[HTTP] %s %s.', platformLang.accTokenStoreErr, parseError(e));
        }
      }

      const devices = await this.httpClient.getDevices();
      for (const d of devices) {
        httpDevices.push(d as unknown as Record<string, unknown>);
      }
      this.log.info('[HTTP] %s.', platformLang.availableWithDevices(devices.length));

      if (!this.config.awsDisable && this.iotPass && this.accountTopic && this.accountId) {
        const iotFileData = await pfxToCertAndKey(iotFile, this.iotPass);
        this.awsClient = new AWSClient({
          accountTopic: this.accountTopic,
          accountId: this.accountId,
          clientId: this.clientId ?? 'homebridge-govee',
          iotEndpoint: this.iotEndpoint ?? '',
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
      this.log.warn('[BLE] %s %s.', platformLang.disableClient, parseError(err));
      this.bleClient = false;
    }
  }

  private async initializeDevices(): Promise<void> {
    let lanDevicesInitialised = false;
    let httpDevicesInitialised = false;

    for (const httpDevice of httpDevices) {
      let deviceId = httpDevice.device as string;
      if (!deviceId.includes(':')) {
        deviceId = deviceId.replace(/([a-z0-9]{2})(?=[a-z0-9])/gi, '$&:').toUpperCase();
        httpDevice.device = deviceId;
      }

      if (this.ignoredDevices.includes(deviceId)) {
        continue;
      }

      const model = httpDevice.sku as string;
      const lanDevice = lanDevices.find(el => el.device === deviceId);

      if (lanDevice) {
        this.initialiseDevice({ ...lanDevice, httpInfo: httpDevice, model, deviceName: httpDevice.deviceName, isLanDevice: true });
        lanDevicesInitialised = true;
        (lanDevice as Record<string, unknown>).initialised = true;
      } else {
        this.initialiseDevice({ device: deviceId, deviceName: httpDevice.deviceName, model, httpInfo: httpDevice });
      }
      httpDevicesInitialised = true;
    }

    for (const lanDevice of lanDevices.filter(el => !(el as Record<string, unknown>).initialised)) {
      const deviceId = lanDevice.device as string;
      if (this.ignoredDevices.includes(deviceId)) {
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

    devicesInHB.forEach((accessory) => {
      const deviceId = accessory.context.gvDeviceId;
      if (
        (!httpDevices.some(el => el.device === deviceId) && !lanDevices.some(el => el.device === deviceId)) ||
        this.ignoredDevices.includes(deviceId)
      ) {
        this.removeAccessory(accessory);
      }
    });

    if (this.awsClient && awsDevices.length > 0) {
      await this.awsClient.connect();
      this.goveeAWSSync(true);
      this.refreshAWSInterval = setInterval(() => this.goveeAWSSync(), 60000);
    }

    if (lanDevicesInitialised && this.lanClient) {
      this.lanClient.startDevicesPolling();
      this.lanClient.startStatusPolling();
    }
  }

  pluginShutdown(): void {
    try {
      if (this.refreshBLEInterval) {
        clearInterval(this.refreshBLEInterval);
      }
      if (this.refreshHTTPInterval) {
        clearInterval(this.refreshHTTPInterval);
      }
      if (this.refreshAWSInterval) {
        clearInterval(this.refreshAWSInterval);
      }
      if (this.lanClient) {
        this.lanClient.close();
      }
      if (this.bleClient) {
        this.bleClient.shutdown();
      }
    } catch (err) {
      this.log.error('***** %s. *****', parseError(err));
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

      let accessory = devicesInHB.get(uuid);
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
      if (httpInfo?.deviceExt) {
        const deviceExt = httpInfo.deviceExt as Record<string, unknown>;
        if (deviceExt.deviceSettings) {
          const parsed = JSON.parse(deviceExt.deviceSettings as string);
          if (parsed?.topic) {
            accessory.context.hasAwsControl = true;
            accessory.context.awsTopic = parsed.topic;
            if (this.awsClient) {
              accessory.context.useAwsControl = true;
              awsDevices.push(deviceId);
            }
          }
          if (parsed?.bleName) {
            accessory.context.hasBleControl = true;
            accessory.context.bleAddress = parsed.address?.toLowerCase() || deviceId.substring(6).toLowerCase();
            if (this.bleClient) {
              accessory.context.useBleControl = true;
            }
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
      devicesInHB.set(accessory.UUID, accessory);
    } catch (err) {
      this.log.warn('[%s] %s %s.', device.deviceName, platformLang.devNotInit, parseError(err));
    }
  }

  addAccessory(device: { device: string; deviceName: string; model: string }): GoveePlatformAccessoryWithControl | undefined {
    try {
      const uuid = this.api.hap.uuid.generate(device.device);
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
    devicesInHB.set(accessory.UUID, acc);
  }

  removeAccessory(accessory: GoveePlatformAccessory): void {
    try {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      devicesInHB.delete(accessory.UUID);
      this.log.info('[%s] %s.', accessory.displayName, platformLang.devRemove);
    } catch (err) {
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.devNotRemove, parseError(err));
    }
  }

  async goveeAWSSync(allDevices = false): Promise<void> {
    const pollList = allDevices ? awsDevices : awsDevicesToPoll;
    if (pollList.length === 0 || !this.awsClient) {
      return;
    }
    for (const deviceId of pollList) {
      const accessory = devicesInHB.get(this.api.hap.uuid.generate(deviceId));
      if (accessory) {
        try {
          await this.awsClient.requestUpdate(accessory);
        } catch (err) {
          accessory.logDebugWarn?.(`[AWS] ${platformLang.syncFail} ${parseError(err)}`);
        }
      }
    }
  }

  async sendDeviceUpdate(accessory: GoveePlatformAccessoryWithControl, params: DeviceCommand): Promise<boolean> {
    const data: { awsParams?: AWSParams; bleParams?: BLEParams; lanParams?: LANParams } = {};

    switch (params.cmd) {
    case 'state':
      data.awsParams = { cmd: 'turn', data: { val: params.value === 'on' ? 1 : 0 } };
      data.bleParams = { cmd: 0x01, data: params.value === 'on' ? 0x1 : 0x0 };
      data.lanParams = { cmd: 'turn', data: { value: params.value === 'on' ? 1 : 0 } };
      break;
    case 'brightness': {
      const val = params.value as number;
      data.awsParams = { cmd: 'brightness', data: { val: Math.round(val * 2.54) } };
      data.bleParams = { cmd: 0x04, data: Math.floor((val / 100) * 0xff) };
      data.lanParams = { cmd: 'brightness', data: { value: val } };
      break;
    }
    case 'color': {
      const rgb = params.value as { r: number; g: number; b: number };
      data.awsParams = { cmd: 'colorwc', data: { color: rgb, colorTemInKelvin: 0 } };
      data.bleParams = { cmd: 0x05, data: [0x02, rgb.r, rgb.g, rgb.b] };
      data.lanParams = { cmd: 'colorwc', data: { color: rgb, colorTemInKelvin: 0 } };
      break;
    }
    case 'colorTem': {
      const kelvin = params.value as number;
      const [r, g, b] = k2rgb(kelvin);
      data.awsParams = { cmd: 'colorwc', data: { color: { r, g, b }, colorTemInKelvin: kelvin } };
      data.bleParams = { cmd: 0x05, data: [0x02, 0xff, 0xff, 0xff, 0x01, r, g, b] };
      data.lanParams = { cmd: 'colorwc', data: { color: { r, g, b }, colorTemInKelvin: kelvin } };
      break;
    }
    case 'stateOutlet':
    case 'stateHumi':
      data.awsParams = { cmd: 'turn', data: { val: params.value === 'on' || params.value === 1 ? 1 : 0 } };
      break;
    case 'stateDual':
      data.awsParams = { cmd: 'turn', data: { val: params.value } };
      break;
    case 'ptReal': {
      const code = params.value as string;
      data.awsParams = { cmd: 'ptReal', data: { command: [code] } };
      data.bleParams = { cmd: 'ptReal', data: base64ToHex(code) };
      break;
    }
    case 'rgbScene': {
      const [awsCode, bleCode] = params.value as [string, string | undefined];
      if (awsCode) {
        data.awsParams = { cmd: 'ptReal', data: { command: awsCode.split(',') } };
      }
      if (bleCode) {
        data.bleParams = { cmd: 'ptReal', data: bleCode };
      }
      break;
    }
    default:
      throw new Error('Invalid command');
    }

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

    if (!data.bleParams) {
      return true;
    }

    return this.queue.add(async () => {
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
    devicesInHB.forEach((accessory) => {
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
          this.receiveDeviceUpdate(accessory, { source: 'LAN', state: params.state as 'on' | 'off' });
        }
      }
    });
  }

  receiveUpdateAWS(payload: Record<string, unknown>): void {
    const accessory = devicesInHB.get(this.api.hap.uuid.generate(payload.device as string));
    if (accessory) {
      this.receiveDeviceUpdate(accessory, { source: 'AWS', ...payload } as ExternalUpdateParams);
    }
  }

  receiveDeviceUpdate(accessory: GoveePlatformAccessoryWithControl, params: ExternalUpdateParams): void {
    if (!accessory?.control?.externalUpdate) {
      return;
    }

    const data: ExternalUpdateParams = { source: params.source };
    if (params.state && typeof params.state === 'object' && hasProperty(params.state, 'onOff')) {
      data.state = [1, 17].includes((params.state as Record<string, unknown>).onOff as number) ? 'on' : 'off';
    } else if (typeof params.state === 'string') {
      data.state = params.state;
    }

    if (hasProperty(params, 'battery')) {
      data.battery = Math.min(Math.max(params.battery!, 0), 100);
    }
    if (hasProperty(params, 'leakDetected')) {
      data.leakDetected = params.leakDetected;
    }
    if (hasProperty(params, 'temperature')) {
      data.temperature = params.temperature;
    }
    if (hasProperty(params, 'humidity')) {
      data.humidity = params.humidity;
    }
    if (hasProperty(params, 'online')) {
      data.online = params.online;
    }

    if (Object.keys(data).length > 1) {
      try {
        accessory.control.externalUpdate(data);
      } catch (err) {
        this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.devNotUpdated, parseError(err));
      }
    }
  }

  updateAccessoryStatus(accessory: GoveePlatformAccessoryWithControl, online: boolean): void {
    accessory.log?.(`Device is ${online ? 'online' : 'offline'}`);
  }
}

export default GoveePlatform;
