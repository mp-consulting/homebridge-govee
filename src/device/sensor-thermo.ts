import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams, SensorDeviceConfig, EveHistoryService } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformConsts, platformLang } from '../utils/index.js';
import { cenToFar, generateRandomString, hasProperty, parseError } from '../utils/functions.js';

/**
 * Temperature/Humidity sensor device handler.
 * Supports temperature, humidity, and battery level monitoring.
 */
export class SensorThermoDevice extends GoveeDeviceBase {
  private tempService!: Service;
  private humiService!: Service;
  private battService!: Service;

  // Configuration
  private readonly lowBattThreshold: number;
  private readonly httpTimeout: number;

  // Cached values
  private cacheTemp = 0;
  private cacheHumi = 0;
  private cacheBatt = 0;
  private cacheOnline = true;

  // BLE priority key
  private bleKey: string | false = false;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);

    // Set up custom variables for this device type
    const deviceConf = this.deviceConf as unknown as SensorDeviceConfig;
    this.lowBattThreshold = deviceConf.lowBattThreshold
      ? Math.min(deviceConf.lowBattThreshold, 100)
      : platformConsts.defaultValues.lowBattThreshold;

    this.httpTimeout = (platform.config.bleRefreshTime ?? 15) * 4.5 * 1000;
  }

  get service(): Service {
    return this.tempService;
  }

  init(): void {
    // Remove any thermostat service if it exists
    this.removeServiceIfExists('Thermostat');

    // Add the temperature service if it doesn't already exist
    this.tempService = this.accessory.getService(this.hapServ.TemperatureSensor)
      || this.accessory.addService(this.hapServ.TemperatureSensor);
    this.cacheTemp = this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).value as number;

    // Add the battery service if it doesn't already exist
    this.battService = this.accessory.getService(this.hapServ.Battery)
      || this.accessory.addService(this.hapServ.Battery);
    this.cacheBatt = this.battService.getCharacteristic(this.hapChar.BatteryLevel).value as number;

    // Add the humidity service if it doesn't already exist
    this.humiService = this.accessory.getService(this.hapServ.HumiditySensor)
      || this.accessory.addService(this.hapServ.HumiditySensor);
    this.cacheHumi = this.humiService.getCharacteristic(this.hapChar.CurrentRelativeHumidity).value as number;

    this.updateCache();

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('custom', this.accessory, {
      log: () => {},
    }) as unknown as EveHistoryService;

    // Output the customised options to the log
    this.logInitOptions({
      lowBattThreshold: this.lowBattThreshold,
      showExtraSwitch: false,
    });

    this.initialised = true;
  }

  async externalUpdate(params: ExternalUpdateParams): Promise<void> {
    // Check to see if the provided online status is different from the cache value
    if (hasProperty(params, 'online') && this.cacheOnline !== params.online) {
      this.cacheOnline = params.online!;
      this.updateOnlineStatus(this.cacheOnline);
    }

    if (params.source === 'BLE') {
      // If we have a BLE update then we should ignore HTTP updates for the next 4 BLE refresh cycles
      // Since BLE will be more accurate and may not have updated with the cloud yet
      const bleKey = generateRandomString(5);
      this.bleKey = bleKey;
      setTimeout(() => {
        if (this.bleKey === bleKey) {
          this.bleKey = false;
        }
      }, this.httpTimeout);
    }

    if (params.source === 'HTTP' && this.bleKey) {
      return;
    }

    // Check to see if the provided battery is different from the cached state
    if (params.battery !== undefined && params.battery !== this.cacheBatt && this.battService) {
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

    // Check to see if the provided temperature is different from the cached state
    if (hasProperty(params, 'temperature')) {
      const offTemp = this.accessory.context.offTemp ?? 0;
      let newTemp = Number.parseInt(String(params.temperature! + offTemp), 10);
      newTemp /= 100;
      if (newTemp !== this.cacheTemp) {
        // Temperature is different so update Homebridge with new values
        this.cacheTemp = newTemp;
        this.tempService.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp);
        if (this.accessory.eveService) {
          this.accessory.eveService.addEntry({ temp: this.cacheTemp });
        }

        // Log the change
        this.accessory.log(`${platformLang.curTemp} [${this.cacheTemp}°C / ${cenToFar(this.cacheTemp)}°F]`);

        // Update the cache file with the new temperature
        this.updateCache();
      }
    }

    // Check to see if the provided humidity is different from the cached state
    if (hasProperty(params, 'humidity')) {
      const offHumi = this.accessory.context.offHumi ?? 0;
      let newHumi = Number.parseInt(String(params.humidity! + offHumi), 10);
      newHumi /= 100;
      newHumi = Math.max(Math.min(newHumi, 100), 0);
      if (newHumi !== this.cacheHumi) {
        // Humidity is different so update Homebridge with new values
        this.cacheHumi = newHumi;
        this.humiService.updateCharacteristic(this.hapChar.CurrentRelativeHumidity, this.cacheHumi);
        if (this.accessory.eveService) {
          this.accessory.eveService.addEntry({ humidity: this.cacheHumi });
        }

        // Log the change
        this.accessory.log(`${platformLang.curHumi} [${this.cacheHumi}%]`);
      }
    }
  }

  private async updateCache(): Promise<void> {
    // Don't continue if the storage client hasn't initialised properly
    if (!this.platform.storageClientData) {
      return;
    }

    // Attempt to save the new temperature to the cache
    try {
      await this.platform.storageData.setItem(
        `${this.deviceId}_temp`,
        this.cacheTemp,
      );
    } catch (err) {
      this.accessory.logWarn(`${platformLang.storageWriteErr} ${parseError(err)}`);
    }
  }
}

export default SensorThermoDevice;
