import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  base64ToHex,
  getTwoItemPosition,
  hexToTwoItems,
} from '../utils/functions.js';

/**
 * Presence sensor device handler.
 * Exposes as an OccupancySensor service.
 */
export class SensorPresenceDevice extends GoveeDeviceBase {
  private _service!: Service;
  private cacheOccupancy = 0;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Add the OccupancySensor service
    this._service = this.accessory.getService(this.hapServ.OccupancySensor)
      || this.accessory.addService(this.hapServ.OccupancySensor);

    this.cacheOccupancy = this._service.getCharacteristic(this.hapChar.OccupancyDetected).value as number;

    // Output the customised options to the log
    this.logInitOptions({});

    this.initialised = true;
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check for command updates
    (params.commands || []).forEach((command: string) => {
      const hexString = base64ToHex(command);
      const hexParts = hexToTwoItems(hexString);

      if (getTwoItemPosition(hexParts, 1) !== 'aa') {
        return;
      }

      const deviceFunction = `${getTwoItemPosition(hexParts, 1)}${getTwoItemPosition(hexParts, 2)}`;

      switch (deviceFunction) {
      case 'aa01': {
        // Occupancy detected
        const newState = getTwoItemPosition(hexParts, 3) === '01' ? 1 : 0;
        if (newState !== this.cacheOccupancy) {
          this.cacheOccupancy = newState;
          this._service.updateCharacteristic(this.hapChar.OccupancyDetected, this.cacheOccupancy);
          this.accessory.log(`${platformLang.curOcc} [${this.cacheOccupancy === 1 ? 'yes' : 'no'}]`);
        }
        break;
      }
      default:
        this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        break;
      }
    });
  }
}

export default SensorPresenceDevice;
