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
 * SensorThermo4 device handler for H5198 model.
 * This is a diagnostic handler that logs all data for debugging.
 * The H5198 appears to be a new sensor model that requires reverse engineering.
 */
export class SensorThermo4Device extends GoveeDeviceBase {
  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service | undefined {
    return undefined;
  }

  init(): void {
    // Remove any existing sensor services - this is a diagnostic handler
    this.removeServiceIfExists('TemperatureSensor');
    this.removeServiceIfExists('HumiditySensor');
    this.removeServiceIfExists('Battery');

    // Output the customised options to the log
    this.logInitOptions({});

    this.accessory.logWarn('H5198 sensor support is under development. Data is being logged for analysis.');

    this.initialised = true;
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Log all parameters for debugging
    this.accessory.logWarn(JSON.stringify(params, null, 2));

    // Check for some other scene/mode change
    if (params.commands) {
      for (const command of params.commands) {
        const hexString = base64ToHex(command);
        const hexParts = hexToTwoItems(hexString);

        this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);

        // Return now if not a device query update code
        if (getTwoItemPosition(hexParts, 1) !== 'aa') {
          continue;
        }

        const deviceFunction = `${getTwoItemPosition(hexParts, 1)}${getTwoItemPosition(hexParts, 2)}`;

        switch (deviceFunction) {
          default:
            this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
            break;
        }
      }
    }
  }
}

export default SensorThermo4Device;
