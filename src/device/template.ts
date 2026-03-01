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
 * Template device handler for unknown/unsupported models.
 * Logs all commands for debugging and development.
 */
export class TemplateDevice extends GoveeDeviceBase {
  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service | undefined {
    return undefined;
  }

  init(): void {
    // Output the customised options to the log
    this.logInitOptions({});
    this.accessory.logWarn('Support for this device is under construction. ' +
      'This may not be possible if this is a Bluetooth-only device.');

    this.initialised = true;
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Log all parameters for debugging
    this.accessory.logWarn(JSON.stringify(params));

    // Check for some other scene/mode change
    if (params.commands) {
      for (const command of params.commands) {
        const hexString = base64ToHex(command);
        const hexParts = hexToTwoItems(hexString);

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

export default TemplateDevice;
