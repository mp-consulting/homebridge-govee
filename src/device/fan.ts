import type { Service, HAPStatus } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  base64ToHex,
  generateCodeFromHexValues,
  getTwoItemPosition,
  hexToTwoItems,
  parseError,
} from '../utils/functions.js';

// Speed codes for H7102 fan model (8 speeds)
const SPEED_CODES_H7102: Record<number, string> = {
  11: 'MwUBAQAAAAAAAAAAAAAAAAAAADY=',
  22: 'MwUBAgAAAAAAAAAAAAAAAAAAADU=',
  33: 'MwUBAwAAAAAAAAAAAAAAAAAAADQ=',
  44: 'MwUBBAAAAAAAAAAAAAAAAAAAADM=',
  55: 'MwUBBQAAAAAAAAAAAAAAAAAAADI=',
  66: 'MwUBBgAAAAAAAAAAAAAAAAAAADE=',
  77: 'MwUBBwAAAAAAAAAAAAAAAAAAADA=',
  88: 'MwUBCAAAAAAAAAAAAAAAAAAAAD8=',
};

/**
 * Fan device handler for H7102 model.
 * Supports on/off, speed control, and swing mode.
 */
export class FanDevice extends GoveeDeviceBase {
  private _service!: Service;

  // Speed codes (can be overridden by subclasses)
  protected speedCodes: Record<number, string> = SPEED_CODES_H7102;

  // Cached values
  private cacheSpeed = 0;
  private cacheMode: 'auto' | 'manual' = 'manual';
  private cacheSwing: 'on' | 'off' = 'off';
  private cacheAutoCode?: string;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove any old original Fan services
    this.removeServiceIfExists('Fan');

    // Add the fan service for the fan if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.Fanv2)
      || this.accessory.addService(this.hapServ.Fanv2);

    // Add the set handler to the fan on/off characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value ? 'on' : 'off';

    // Add the set handler to the fan rotation speed characteristic
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        minStep: 11,
        minValue: 0,
        validValues: [0, 11, 22, 33, 44, 55, 66, 77, 88, 99],
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;
    this.cacheMode = this.cacheSpeed === 99 ? 'auto' : 'manual';

    // Add the set handler to the fan swing mode
    this._service
      .getCharacteristic(this.hapChar.SwingMode)
      .onSet(async (value) => this.internalSwingUpdate(value as number));
    this.cacheSwing = this._service.getCharacteristic(this.hapChar.SwingMode).value === 1 ? 'on' : 'off';

    // Output the customised options to the log
    this.logInitOptions({});

    this.initialised = true;
  }

  private async internalStateUpdate(value: number): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      // Don't continue if the new value is the same as before
      if (this.cacheState === newValue) {
        return;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: value ? 'MwEBAAAAAAAAAAAAAAAAAAAAADM=' : 'MwEAAAAAAAAAAAAAAAAAAAAAADI=',
      });

      // Cache the new state and log if appropriate
      if (this.cacheState !== newValue) {
        this.cacheState = newValue;
        this.accessory.log(`${platformLang.curState} [${newValue}]`);
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      // Don't continue if the value is lower than 11
      if (value < 11) {
        return;
      }
      let newMode: 'auto' | 'manual' = value === 99 ? 'auto' : 'manual';
      let newValue = value;

      // Don't continue if the new value is the same as before
      if (this.cacheSpeed === value) {
        return;
      }

      // Don't continue if trying to access auto mode but there is no sensor attached
      let codeToSend: string;
      if (newMode === 'auto') {
        if (!this.accessory.context.sensorAttached || !this.cacheAutoCode) {
          this.accessory.logWarn('auto mode not supported without a linked sensor');
          codeToSend = this.speedCodes[88];
          newMode = 'manual';
          newValue = 88;
        } else {
          codeToSend = this.cacheAutoCode;
        }
      } else {
        codeToSend = this.speedCodes[value];
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: codeToSend,
      });

      // Cache the new state and log if appropriate
      if (this.cacheMode !== newMode) {
        this.cacheMode = newMode;
        this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
      }
      if (this.cacheSpeed !== newValue) {
        this.cacheSpeed = newValue;
        this.accessory.log(`${platformLang.curSpeed} [${newValue}%]`);
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalSwingUpdate(value: number): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      // Don't continue if the new value is the same as before
      if (this.cacheSwing === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: value ? 'Mx8BAQAAAAAAAAAAAAAAAAAAACw=' : 'Mx8BAAAAAAAAAAAAAAAAAAAAAC0=',
      });

      // Cache the new state and log if appropriate
      if (this.cacheSwing !== newValue) {
        this.cacheSwing = newValue;
        this.accessory.log(`${platformLang.curSwing} [${newValue}]`);
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.SwingMode, this.cacheSwing === 'on' ? 1 : 0);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Update the active characteristic
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }

    // Check for some other scene/mode change
    if (params.commands) {
      this.handleCommandUpdates(params.commands);
    }
  }

  private handleCommandUpdates(commands: string[]): void {
    for (const command of commands) {
      const hexString = base64ToHex(command);
      const hexParts = hexToTwoItems(hexString);

      // Return now if not a device query update code
      if (getTwoItemPosition(hexParts, 1) !== 'aa') {
        continue;
      }

      if (getTwoItemPosition(hexParts, 2) === '08') {
        // Sensor Attached?
        const dev = hexString.substring(4, hexString.length - 24);
        this.accessory.context.sensorAttached = dev !== '000000000000';
        continue;
      }

      const deviceFunction = `${getTwoItemPosition(hexParts, 2)}${getTwoItemPosition(hexParts, 3)}`;

      switch (deviceFunction) {
        case '0501': {
          // Fan speed
          const newSpeed = getTwoItemPosition(hexParts, 4);
          const newSpeedInt = Number.parseInt(newSpeed, 10) * 11;
          const newMode = 'manual';
          if (this.cacheMode !== newMode) {
            this.cacheMode = newMode;
            this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
          }
          if (this.cacheSpeed !== newSpeedInt) {
            this.cacheSpeed = newSpeedInt;
            this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
            this.accessory.log(`${platformLang.curSpeed} [${this.cacheSpeed}%]`);
          }
          break;
        }
        case '0500': {
          // Auto mode on/off
          // (Guess) Fixed Speed: 1, Custom: 2, Auto: 3, Sleep: 5, Nature: 6, Turbo: 7
          const newMode = getTwoItemPosition(hexParts, 4) === '03' ? 'auto' : 'manual';
          if (this.cacheMode !== newMode) {
            this.cacheMode = newMode;
            this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);

            if (this.cacheMode === 'auto' && this.cacheSpeed !== 99) {
              this.cacheSpeed = 99;
              this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
              this.accessory.log(`${platformLang.curSpeed} [${this.cacheSpeed}%]`);
            }
          }
          break;
        }
        case '0503': {
          // Auto mode, we need to keep this code to send it back to the device
          const code = hexToTwoItems(`33${hexString.substring(2, hexString.length - 2)}`);
          this.cacheAutoCode = generateCodeFromHexValues(code.map((p) => Number.parseInt(p, 16))) as string;
          break;
        }
        case '1f01': {
          // Swing Mode
          const newSwing = getTwoItemPosition(hexParts, 4) === '01' ? 'on' : 'off';
          if (this.cacheSwing !== newSwing) {
            this.cacheSwing = newSwing;
            this._service.updateCharacteristic(this.hapChar.SwingMode, this.cacheSwing === 'on' ? 1 : 0);
            this.accessory.log(`${platformLang.curSwing} [${this.cacheSwing}]`);
          }
          break;
        }
        default:
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
          break;
      }
    }
  }
}

export default FanDevice;
