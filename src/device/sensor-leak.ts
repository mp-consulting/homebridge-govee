import type { Service, Characteristic } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams, SensorDeviceConfig } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformConsts, platformLang } from '../utils/index.js';
import { hasProperty } from '../utils/functions.js';

/**
 * Leak sensor device handler.
 * Supports leak detection and battery level monitoring.
 */
export class SensorLeakDevice extends GoveeDeviceBase {
  private _service!: Service;
  private battService!: Service;
  private eveChar: Record<string, typeof Characteristic>;

  // Configuration
  private readonly lowBattThreshold: number;

  // Cached values
  private cacheLeak = false;
  private cacheBatt = 0;
  private cacheOnline = true;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
    this.eveChar = platform.eveChar as Record<string, typeof Characteristic>;

    // Set up custom variables for this device type
    const deviceConf = this.deviceConf as unknown as SensorDeviceConfig;
    this.lowBattThreshold = deviceConf.lowBattThreshold
      ? Math.min(deviceConf.lowBattThreshold, 100)
      : platformConsts.defaultValues.lowBattThreshold;
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Add the leak sensor service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.LeakSensor)!;
    if (!this._service) {
      this._service = this.accessory.addService(this.hapServ.LeakSensor);

      // Adding the characteristic here avoids Homebridge characteristic warnings
      if (this.eveChar.LastActivation) {
        this._service.addCharacteristic(this.eveChar.LastActivation);
      }
    }
    this.cacheLeak = !!this._service.getCharacteristic(this.hapChar.LeakDetected).value;

    // Add the battery service if it doesn't already exist
    this.battService = this.accessory.getService(this.hapServ.Battery)
      || this.accessory.addService(this.hapServ.Battery);
    this.cacheBatt = this.battService.getCharacteristic(this.hapChar.BatteryLevel).value as number;

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('motion', this.accessory, {
      log: () => {},
    }) as unknown as import('../types.js').EveHistoryService;

    // Output the customised options to the log
    this.logInitOptions({});

    this.initialised = true;
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check to see if the provided online status is different from the cache value
    if (hasProperty(params, 'online') && this.cacheOnline !== params.online) {
      this.cacheOnline = params.online!;
      this.updateOnlineStatus(this.cacheOnline);
    }

    // Check to see if the provided battery is different from the cached state
    if (params.battery !== undefined && params.battery !== this.cacheBatt) {
      // Battery is different so update Homebridge with new values
      this.cacheBatt = params.battery;
      this.battService.updateCharacteristic(this.hapChar.BatteryLevel, this.cacheBatt);
      this.battService.updateCharacteristic(
        this.hapChar.StatusLowBattery,
        this.cacheBatt < this.lowBattThreshold ? 1 : 0,
      );

      // Log the change
      this.accessory.log(`${platformLang.curBatt} [${this.cacheBatt}%]`);
    }

    // Check to see if the provided leak status is different from the cached state
    if (params.leakDetected !== undefined && params.leakDetected !== this.cacheLeak) {
      // Leak status is different so update Homebridge with new values
      this.cacheLeak = params.leakDetected;
      this._service.updateCharacteristic(this.hapChar.LeakDetected, this.cacheLeak ? 1 : 0);

      // Add the alert to Eve if a leak has been detected
      if (this.cacheLeak && this.eveChar.LastActivation && this.accessory.eveService) {
        this._service.updateCharacteristic(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.eveChar.LastActivation as any,
          Math.round(new Date().valueOf() / 1000) - this.accessory.eveService.getInitialTime(),
        );
      }

      // Log the change
      this.accessory.log(
        `${platformLang.curLeak} [${this.cacheLeak ? platformLang.labelYes : platformLang.labelNo}]`,
      );
    }
  }
}

export default SensorLeakDevice;
