import type { Service, HAPStatus } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessory, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { hs2rgb } from '../utils/colour.js';
import {
  base64ToHex,
  generateCodeFromHexValues,
  getTwoItemPosition,
  hexToTwoItems,
  parseError,
} from '../utils/functions.js';

// Speed codes for H7140 model
const SPEED_VALUE_CODES: Record<number, string> = {
  1: 'MwUBAQAAAAAAAAAAAAAAAAAAADY=',
  2: 'MwUBAgAAAAAAAAAAAAAAAAAAADU=',
  3: 'MwUBAwAAAAAAAAAAAAAAAAAAADQ=',
  4: 'MwUBBAAAAAAAAAAAAAAAAAAAADM=',
  5: 'MwUBBQAAAAAAAAAAAAAAAAAAADI=',
  6: 'MwUBBgAAAAAAAAAAAAAAAAAAADE=',
  7: 'MwUBBwAAAAAAAAAAAAAAAAAAADA=',
  8: 'MwUBCAAAAAAAAAAAAAAAAAAAAD8=',
};

/**
 * Humidifier device handler for H7140 model.
 * Supports on/off, speed control, and night light.
 */
export class HumidifierDevice extends GoveeDeviceBase {
  private _service!: Service;
  private lightService!: Service;

  // Cached values
  private cacheSpeed = 0;
  private cacheLightState: 'on' | 'off' = 'off';
  private cacheBright = 100;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessory) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  /**
   * Convert rotation speed (0-100) to value (1-8)
   */
  private speed2Value(speed: number): number {
    return Math.min(Math.max(Math.round(speed / 10), 1), 8);
  }

  init(): void {
    // Add the fan service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.Fan)
      || this.accessory.addService(this.hapServ.Fan);

    // Add the night light service if it doesn't already exist
    this.lightService = this.accessory.getService(this.hapServ.Lightbulb)
      || this.accessory.addService(this.hapServ.Lightbulb);

    // Add the set handler to the fan on/off characteristic
    this._service
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalStateUpdate(value as boolean));
    this.cacheState = this._service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Add the set handler to the fan rotation speed characteristic
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        minStep: 10,
        validValues: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;

    // Add the set handler to the lightbulb on/off characteristic
    this.lightService.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalLightStateUpdate(value as boolean);
    });
    this.cacheLightState = this.lightService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Output the customised options to the log
    this.logInitOptions({});

    this.initialised = true;
  }

  private async internalStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      // Don't continue if the new value is the same as before
      if (this.cacheState === newValue) {
        return;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'stateHumi',
        value: value ? 1 : 0,
      });

      // Cache the new state and log if appropriate
      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
      }, 2000);
      throw new this.hapErr(-70402 as HAPStatus);
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      // Don't continue if the speed is 0
      if (value === 0) {
        return;
      }

      // Get the single Govee value {1, 2, ..., 8}
      const newValue = this.speed2Value(value);

      // Don't continue if the speed value won't have effect
      if (newValue * 10 === this.cacheSpeed) {
        return;
      }

      // Get the scene code for this value
      const newCode = SPEED_VALUE_CODES[newValue];

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: newCode,
      });

      // Cache the new state and log if appropriate
      this.cacheSpeed = newValue * 10;
      this.accessory.log(`${platformLang.curSpeed} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      }, 2000);
      throw new this.hapErr(-70402 as HAPStatus);
    }
  }

  private async internalLightStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      // Don't continue if the new value is the same as before
      if (this.cacheLightState === newValue) {
        return;
      }

      // Generate the hex values for the code
      let hexValues: number[];
      if (value) {
        // Calculate current RGB values
        const newRGB = hs2rgb(
          this.lightService.getCharacteristic(this.hapChar.Hue).value as number,
          this.lightService.getCharacteristic(this.hapChar.Saturation).value as number
        );
        hexValues = [0x33, 0x1b, 0x01, this.cacheBright, ...newRGB];
      } else {
        hexValues = [0x33, 0x1b, 0x00];
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: generateCodeFromHexValues(hexValues),
      });

      // Cache the new state and log if appropriate
      if (this.cacheLightState !== newValue) {
        this.cacheLightState = newValue;
        this.accessory.log(`${platformLang.curLight} [${newValue}]`);
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLightState === 'on');
      }, 2000);
      throw new this.hapErr(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check for an ON/OFF change
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');

      // Log the change
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

      const deviceFunction = `${getTwoItemPosition(hexParts, 2)}${getTwoItemPosition(hexParts, 3)}`;

      switch (deviceFunction) {
        case '1b00': // night light off
        case '1b01': { // night light on
          const newNight = deviceFunction === '1b01' ? 'on' : 'off';
          if (newNight !== this.cacheLightState) {
            this.cacheLightState = newNight;
            this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLightState === 'on');
            this.accessory.log(`current night light state [${this.cacheLightState}]`);
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

export default HumidifierDevice;
