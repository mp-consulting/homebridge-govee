import { Buffer } from 'node:buffer';
import process from 'node:process';

import type { BLEParams, BLESensorReading, GoveeLogging, GoveePlatformAccessoryWithControl } from '../types.js';
import { decodeAny } from '../utils/decode.js';
import { base64ToHex, generateCodeFromHexValues, hexToTwoItems } from '../utils/functions.js';
import platformLang from '../utils/lang-en.js';
import { isValidPeripheral } from '../utils/validation.js';

process.env.NOBLE_REPORT_ALL_HCI_EVENTS = '1';

const H5075_UUID = 'ec88';
const H5101_UUID = '0001';
const CONTROL_CHARACTERISTIC_UUID = '000102030405060708090a0b0c0d1910';
const CONNECTION_TIMEOUT = 10000;
const WRITE_TIMEOUT = 5000;

interface Noble {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, callback: (...args: any[]) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeListener(event: string, callback: (...args: any[]) => void): void;
  removeAllListeners(): void;
  startScanningAsync(serviceUUIDs: string[], allowDuplicates: boolean): Promise<void>;
  stopScanningAsync(): Promise<void>;
  stopScanning(): void;
  waitForPoweredOnAsync(): Promise<void>;
  connectAsync(address: string): Promise<Peripheral>;
  reset(): void;
}

interface Peripheral {
  uuid: string;
  address: string;
  rssi: number;
  advertisement: {
    localName?: string;
    manufacturerData?: Buffer;
  };
  discoverAllServicesAndCharacteristicsAsync(): Promise<{
    services: unknown[];
    characteristics: Characteristic[];
  }>;
  disconnectAsync(): Promise<void>;
}

interface Characteristic {
  uuid: string;
  writeAsync(buffer: Buffer, withoutResponse: boolean): Promise<void>;
}

interface BLEPlatformRef {
  log: GoveeLogging;
}

interface EventHandlers {
  stateChange: ((state: string) => void) | null;
  scanStart: (() => void) | null;
  scanStop: (() => void) | null;
  warning: ((message: string) => void) | null;
  discover: ((peripheral: Peripheral) => void) | null;
}

export default class BLEClient {
  private log: GoveeLogging;
  private btState = 'unknown';
  public isScanning = false;
  public isConnecting = false;
  private activeConnection: Peripheral | null = null;
  private discoverCallback: ((reading: BLESensorReading) => void) | null = null;
  private scanTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isShuttingDown = false;
  private eventHandlers: EventHandlers;
  private btClient: Noble | null = null;

  constructor(platform: BLEPlatformRef) {
    this.log = platform.log;

    this.eventHandlers = {
      stateChange: null,
      scanStart: null,
      scanStop: null,
      warning: null,
      discover: null,
    };

    this.setupEventListeners();
  }

  private async setupEventListeners(): Promise<void> {
    try {
      const { default: noble } = await import('@stoprocent/noble');
      this.btClient = noble as Noble;

      this.eventHandlers.stateChange = (state: string) => {
        if (this.isShuttingDown) {
          return;
        }
        this.btState = state;
        this.log.debug('[BLE] adapter state changed to: %s.', state);

        if (state !== 'poweredOn') {
          this.handleAdapterPowerLoss();
        }
      };

      this.eventHandlers.scanStart = () => {
        if (this.isShuttingDown) {
          return;
        }
        this.isScanning = true;
        this.log.debug('[BLE] scanning started.');
      };

      this.eventHandlers.scanStop = () => {
        if (this.isShuttingDown) {
          return;
        }
        this.isScanning = false;
        this.log.debug('[BLE] scanning stopped.');
      };

      this.eventHandlers.warning = (message: string) => {
        if (this.isShuttingDown) {
          return;
        }
        this.log.warn('[BLE] adapter warning: %s.', message);
      };

      this.eventHandlers.discover = (peripheral: Peripheral) => {
        if (this.isShuttingDown) {
          return;
        }
        this.handleDiscoveredPeripheral(peripheral);
      };

      this.btClient.on('stateChange', this.eventHandlers.stateChange);
      this.btClient.on('scanStart', this.eventHandlers.scanStart);
      this.btClient.on('scanStop', this.eventHandlers.scanStop);
      this.btClient.on('warning', this.eventHandlers.warning);
      this.btClient.on('discover', this.eventHandlers.discover);

      // Handle Noble-specific errors without installing global process handlers
      this.btClient.on('error', (err: Error) => {
        if (this.isShuttingDown) {
          return;
        }
        if (err.message && err.message.includes('BLEManager')) {
          this.log.warn('[BLE] native ble error detected: %s. BLE functionality may be limited.', err.message);
        } else {
          this.log.warn('[BLE] adapter error: %s.', err.message);
        }
      });
    } catch (err) {
      this.log.warn('[BLE] failed to setup event listeners:', (err as Error).message);
    }
  }

  private handleDiscoveredPeripheral(peripheral: Peripheral): void {
    try {
      const { uuid, address, rssi, advertisement } = peripheral;

      if (!isValidPeripheral({ advertisement })) {
        return;
      }

      const { localName, manufacturerData } = advertisement;
      if (!manufacturerData) {
        return;
      }

      const streamUpdate = manufacturerData.toString('hex');
      this.log.debug('[BLE] sensor data from %s: %s.', address, streamUpdate);

      const decodedValues = decodeAny(streamUpdate);

      if (this.discoverCallback) {
        this.discoverCallback({
          uuid,
          address,
          model: localName || '',
          battery: decodedValues.battery,
          humidity: decodedValues.humidity,
          tempInC: decodedValues.tempInC,
          tempInF: decodedValues.tempInF,
          rssi,
        });
      }
    } catch (err) {
      this.log.debug('[BLE] error processing discovered peripheral: %s.', (err as Error).message);
    }
  }

  private handleAdapterPowerLoss(): void {
    if (this.isScanning) {
      this.isScanning = false;
      this.discoverCallback = null;
    }

    if (this.activeConnection) {
      this.activeConnection = null;
      this.isConnecting = false;
    }

    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
      this.scanTimeoutId = null;
    }
  }

  private async waitForPowerOn(timeout = 5000): Promise<boolean> {
    if (this.btState === 'poweredOn') {
      return true;
    }

    if (!this.btClient) {
      return false;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.btClient.waitForPoweredOnAsync(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('timeout waiting for bluetooth adapter')), timeout);
        }),
      ]);
      return true;
    } catch (err) {
      this.log.warn('[BLE] failed to power on adapter: %s.', (err as Error).message);
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async updateDevice(accessory: GoveePlatformAccessoryWithControl, params: BLEParams): Promise<void> {
    accessory.logDebug(`starting ble update with params [${JSON.stringify(params)}]`);

    if (!(await this.waitForPowerOn())) {
      throw new Error(`${platformLang.bleWrongState} [${this.btState}]`);
    }

    if (!this.btClient) {
      throw new Error('BLE client not initialized');
    }

    const wasScanning = this.isScanning;
    const savedDiscoverCallback = this.discoverCallback;
    if (wasScanning) {
      accessory.logDebug('pausing sensor scan for device update');
      await this.stopDiscovery();
    }

    this.isConnecting = true;
    let peripheral: Peripheral | null = null;

    try {
      this.btClient.reset();

      accessory.logDebug('connecting to device at %s', accessory.context.bleAddress);
      peripheral = await this.connectWithTimeout(accessory.context.bleAddress!, CONNECTION_TIMEOUT);
      this.activeConnection = peripheral;
      accessory.logDebug('connected successfully');

      accessory.logDebug('discovering services and characteristics');
      const { characteristics } = await peripheral.discoverAllServicesAndCharacteristicsAsync();

      const characteristic = Object.values(characteristics).find(
        (char) => char.uuid.replace(/-/g, '') === CONTROL_CHARACTERISTIC_UUID,
      );

      if (!characteristic) {
        throw new Error('Control characteristic not found');
      }
      accessory.logDebug('found control characteristic');

      const finalBuffer = this.prepareCommandBuffer(params);
      accessory.logDebug(`sending command: ${finalBuffer.toString('hex')}`);

      await this.writeWithTimeout(characteristic, finalBuffer, WRITE_TIMEOUT);
      accessory.logDebug('command sent successfully');
    } catch (err) {
      accessory.logWarn(`BLE update failed: ${(err as Error).message}`);
      throw err;
    } finally {
      this.isConnecting = false;
      this.activeConnection = null;

      if (peripheral) {
        try {
          accessory.logDebug('disconnecting from device');
          await peripheral.disconnectAsync();
          accessory.logDebug('disconnected');
        } catch (err) {
          accessory.logDebug('disconnect error (non-critical): %s', (err as Error).message);
        }
      }

      if (wasScanning && savedDiscoverCallback) {
        setTimeout(() => {
          this.startDiscovery(savedDiscoverCallback).catch((err) =>
            this.log.debug('[BLE] failed to resume scanning: %s.', (err as Error).message),
          );
        }, 1000);
      }
    }
  }

  private async connectWithTimeout(address: string, timeout: number): Promise<Peripheral> {
    if (!this.btClient) {
      throw new Error('BLE client not initialized');
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.btClient.connectAsync(address),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Connection timeout')), timeout);
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async writeWithTimeout(
    characteristic: Characteristic,
    buffer: Buffer,
    timeout: number,
  ): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        characteristic.writeAsync(buffer, true),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Write timeout')), timeout);
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private prepareCommandBuffer(params: BLEParams): Buffer {
    if (params.cmd === 'ptReal') {
      return Buffer.from(
        hexToTwoItems(base64ToHex(params.data as string)).map((byte) => Number.parseInt(`0x${byte}`, 16)),
      );
    }
    return generateCodeFromHexValues([0x33, params.cmd as number, params.data as number], true) as Buffer;
  }

  async startDiscovery(callback: (reading: BLESensorReading) => void): Promise<void> {
    if (this.isConnecting) {
      this.log.debug('[BLE] skipping sensor scan - device connection in progress.');
      return;
    }

    if (this.isScanning) {
      this.log.debug('[BLE] already scanning.');
      return;
    }

    if (!(await this.waitForPowerOn())) {
      throw new Error('bluetooth adapter not ready');
    }

    if (!this.btClient) {
      throw new Error('BLE client not initialized');
    }

    this.discoverCallback = callback;

    try {
      await this.btClient.startScanningAsync([H5075_UUID, H5101_UUID], true);
      this.log.debug('[BLE] started scanning for sensors.');
    } catch (err) {
      this.discoverCallback = null;
      const message = (err as Error).message;
      if (message && (message.includes('BLEManager') || message.includes('SIGABRT'))) {
        this.log.error('[BLE] native ble crash detected, ble functionality disabled for this session.');
        this.isShuttingDown = true;
      }
      throw err;
    }
  }

  async stopDiscovery(): Promise<void> {
    this.discoverCallback = null;

    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
      this.scanTimeoutId = null;
    }

    if (this.isScanning && this.btClient) {
      try {
        await this.btClient.stopScanningAsync();
        this.log.debug('[BLE] stopped scanning.');
      } catch (err) {
        this.log.debug('[BLE] error stopping scan: %s.', (err as Error).message);
      }
    }
  }

  shutdown(): void {
    this.log('[BLE] shutting down.');
    this.isShuttingDown = true;

    try {
      if (this.btClient) {
        if (this.eventHandlers.stateChange) {
          this.btClient.removeListener('stateChange', this.eventHandlers.stateChange);
        }
        if (this.eventHandlers.scanStart) {
          this.btClient.removeListener('scanStart', this.eventHandlers.scanStart);
        }
        if (this.eventHandlers.scanStop) {
          this.btClient.removeListener('scanStop', this.eventHandlers.scanStop);
        }
        if (this.eventHandlers.warning) {
          this.btClient.removeListener('warning', this.eventHandlers.warning);
        }
        if (this.eventHandlers.discover) {
          this.btClient.removeListener('discover', this.eventHandlers.discover);
        }
      }

      this.eventHandlers = {
        stateChange: null,
        scanStart: null,
        scanStop: null,
        warning: null,
        discover: null,
      };
    } catch (err) {
      this.log('[BLE] error removing event listeners: %s.', (err as Error).message);
    }

    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
      this.scanTimeoutId = null;
    }

    try {
      if (this.btClient) {
        this.btClient.stopScanning();
      }
    } catch (err) {
      this.log('[BLE] error stopping scan during shutdown: %s.', (err as Error).message);
    }

    this.discoverCallback = null;
    this.isScanning = false;
    this.isConnecting = false;
    this.activeConnection = null;

    try {
      if (this.btClient) {
        this.btClient.reset();
      }
    } catch (err) {
      this.log('[BLE] error resetting adapter during shutdown: %s.', (err as Error).message);
    }

    try {
      if (this.btClient?.removeAllListeners) {
        this.btClient.removeAllListeners();
      }
    } catch (err) {
      this.log('[BLE] error removing all listeners during shutdown: %s.', (err as Error).message);
    }

    this.log('[BLE] shutdown complete.');
  }
}
