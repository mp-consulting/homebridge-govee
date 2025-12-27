import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformConsts, platformLang } from '../utils/index.js';
import {
  base64ToHex,
  cenToFar,
  getTwoItemPosition,
  hexToDecimal,
  hexToTwoItems,
  parseError,
} from '../utils/functions.js';

/**
 * Air quality monitor sensor device handler.
 * Exposes Temperature, Humidity, and Air Quality sensors.
 */
export class SensorMonitorDevice extends GoveeDeviceBase {
  private _service!: Service;
  private tempService!: Service;
  private humiService!: Service;
  private airService!: Service;

  private readonly lowBattThreshold: number;
  private cacheTemp = 20;
  private cacheHumi = 50;
  private cacheAir = 0;
  private cacheAirQual = 'unknown';

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);

    const deviceConf = platform.deviceConf[accessory.context.gvDeviceId] || {};
    this.lowBattThreshold = deviceConf.lowBattThreshold
      ? Math.min(deviceConf.lowBattThreshold as number, 100)
      : platformConsts.defaultValues.lowBattThreshold;
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Add the Temperature service
    this.tempService = this.accessory.getService(this.hapServ.TemperatureSensor)
      || this.accessory.addService(this.hapServ.TemperatureSensor);
    this.cacheTemp = this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).value as number;
    this.updateCache();

    // Add the Humidity service
    this.humiService = this.accessory.getService(this.hapServ.HumiditySensor)
      || this.accessory.addService(this.hapServ.HumiditySensor);
    this.cacheHumi = this.humiService.getCharacteristic(this.hapChar.CurrentRelativeHumidity).value as number;

    // Add the Air Quality service
    let airService = this.accessory.getService(this.hapServ.AirQualitySensor);
    if (!airService) {
      airService = this.accessory.addService(this.hapServ.AirQualitySensor);
      airService.addCharacteristic(this.hapChar.PM2_5Density);
    }
    this.airService = airService;
    this.cacheAir = this.airService.getCharacteristic(this.hapChar.PM2_5Density).value as number;

    // Set main service as temperature
    this._service = this.tempService;

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('custom', this.accessory, {
      log: () => {},
    }) as unknown as import('../types.js').EveHistoryService;

    // Output the customised options to the log
    this.logInitOptions({ lowBattThreshold: this.lowBattThreshold });

    this.initialised = true;
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check for command updates
    (params.commands || []).forEach((command: string) => {
      const hexString = base64ToHex(command);
      const hexParts = hexToTwoItems(hexString);

      const deviceFunction = `${getTwoItemPosition(hexParts, 1)}${getTwoItemPosition(hexParts, 2)}`;

      switch (deviceFunction) {
      case '0000':
      case '0003':
      case '0100':
      case '0101':
      case '0102':
      case '0103':
      case '331a':
      case '3315':
      case 'aa0d':
      case 'aa0e':
        // Known non-data functions, ignore
        break;
      default: {
        const tempInCen = Math.round((hexToDecimal(`0x${deviceFunction}`) +
            (this.accessory.context.offTemp as number || 0) / 100) / 10) / 10;

        // Update temperature
        if (tempInCen !== this.cacheTemp) {
          this.cacheTemp = tempInCen;
          this.tempService.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp);
          if (this.accessory.eveService) {
            this.accessory.eveService.addEntry({ temp: this.cacheTemp });
          }
          this.accessory.log(`${platformLang.curTemp} [${this.cacheTemp}°C / ${cenToFar(tempInCen)}°F]`);
          this.updateCache();
        }

        // Update humidity
        const humiHex = `${getTwoItemPosition(hexParts, 10)}${getTwoItemPosition(hexParts, 11)}`;
        const humiDec = Math.round(hexToDecimal(`0x${humiHex}`) / 100) +
            (this.accessory.context.offHumi as number || 0) / 100;
        if (humiDec !== this.cacheHumi) {
          this.cacheHumi = humiDec;
          this.humiService.updateCharacteristic(this.hapChar.CurrentRelativeHumidity, this.cacheHumi);
          if (this.accessory.eveService) {
            this.accessory.eveService.addEntry({ humidity: this.cacheHumi });
          }
          this.accessory.log(`${platformLang.curHumi} [${this.cacheHumi}%]`);
        }

        // Update air quality
        const qualHex = `${getTwoItemPosition(hexParts, 19)}${getTwoItemPosition(hexParts, 20)}`;
        const qualDec = hexToDecimal(`0x${qualHex}`);
        if (qualDec !== this.cacheAir) {
          this.cacheAir = qualDec;
          this.airService.updateCharacteristic(this.hapChar.PM2_5Density, this.cacheAir);
          this.accessory.log(`${platformLang.curPM25} [${qualDec}µg/m³]`);

          // Map PM2.5 to HomeKit air quality (1-5)
          let newQual: string;
          let hapValue: number;
          if (this.cacheAir <= 12) {
            newQual = 'excellent';
            hapValue = 1;
          } else if (this.cacheAir <= 35) {
            newQual = 'good';
            hapValue = 2;
          } else if (this.cacheAir <= 75) {
            newQual = 'fair';
            hapValue = 3;
          } else if (this.cacheAir <= 115) {
            newQual = 'inferior';
            hapValue = 4;
          } else {
            newQual = 'poor';
            hapValue = 5;
          }

          if (this.cacheAirQual !== newQual) {
            this.cacheAirQual = newQual;
            this.airService.updateCharacteristic(this.hapChar.AirQuality, hapValue);
            this.accessory.log(`${platformLang.curAirQual} [${newQual}]`);
          }
        }
        break;
      }
      }
    });
  }

  private async updateCache(): Promise<void> {
    if (!this.platform.storageClientData) {
      return;
    }

    try {
      await this.platform.storageData.setItem(
        `${this.accessory.context.gvDeviceId}_temp`,
        this.cacheTemp,
      );
    } catch (err) {
      this.accessory.logWarn(`${platformLang.storageWriteErr} ${parseError(err)}`);
    }
  }
}

export default SensorMonitorDevice;
