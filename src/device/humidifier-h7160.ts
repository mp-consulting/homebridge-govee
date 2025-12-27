import type { Service, HAPStatus } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { hs2rgb, rgb2hs } from '../utils/colour.js';
import {
  base64ToHex,
  generateCodeFromHexValues,
  generateRandomString,
  getTwoItemPosition,
  hexToDecimal,
  hexToTwoItems,
  parseError,
  sleep,
} from '../utils/functions.js';

// Speed codes for H7160 model (9 speeds)
const SPEED_VALUE_CODES: Record<number, string> = {
  1: 'MwUBAQAAAAAAAAAAAAAAAAAAADY=',
  2: 'MwUBAgAAAAAAAAAAAAAAAAAAADU=',
  3: 'MwUBAwAAAAAAAAAAAAAAAAAAADQ=',
  4: 'MwUBBAAAAAAAAAAAAAAAAAAAADM=',
  5: 'MwUBBQAAAAAAAAAAAAAAAAAAADI=',
  6: 'MwUBBgAAAAAAAAAAAAAAAAAAADE=',
  7: 'MwUBBwAAAAAAAAAAAAAAAAAAADA=',
  8: 'MwUBCAAAAAAAAAAAAAAAAAAAAD8=',
  9: 'MwUBCQAAAAAAAAAAAAAAAAAAAD4=',
};

/**
 * Humidifier device handler for H7160 model.
 * Has 9 speed levels and RGB night light support.
 */
export class HumidifierH7160Device extends GoveeDeviceBase {
  private _service!: Service;
  private lightService!: Service;

  // Cached values
  private cacheSpeed = 0;
  private cacheSpeedRaw = '01';
  private cacheLightState: 'on' | 'off' = 'off';
  private cacheBright = 100;
  private cacheHue = 0;
  private cacheSat = 0;

  // Debounce keys
  private updateKeyBright?: string;
  private updateKeyColour?: string;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  /**
   * Convert rotation speed (0-100) to value (1-9)
   */
  private speed2Value(speed: number): number {
    return Math.min(Math.max(Math.round(speed / 10), 1), 9);
  }

  init(): void {
    // Add the fan service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.Fan)
      || this.accessory.addService(this.hapServ.Fan);

    // Remove humidity sensor service if it exists (use Fan instead)
    const humiSensor = this.accessory.getService(this.hapServ.HumiditySensor);
    if (humiSensor) {
      this.accessory.removeService(humiSensor);
    }

    // Add the night light service if it doesn't already exist
    this.lightService = this.accessory.getService(this.hapServ.Lightbulb)
      || this.accessory.addService(this.hapServ.Lightbulb);

    // Add the set handler to the fan on/off characteristic
    this._service
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalStateUpdate(value as boolean));
    this.cacheState = this._service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Add the set handler to the fan rotation speed characteristic (10 values for 9 speeds)
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        minStep: 10,
        validValues: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;
    this.cacheSpeedRaw = `0${Math.round(this.cacheSpeed / 10)}`;

    // Add the set handler to the lightbulb on/off characteristic
    this.lightService.getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalLightStateUpdate(value as boolean));
    this.cacheLightState = this.lightService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Add the set handler to the lightbulb brightness characteristic
    this.lightService.getCharacteristic(this.hapChar.Brightness)
      .onSet(async (value) => this.internalBrightnessUpdate(value as number));
    this.cacheBright = this.lightService.getCharacteristic(this.hapChar.Brightness).value as number;

    // Add the set handler to the lightbulb hue characteristic
    this.lightService.getCharacteristic(this.hapChar.Hue)
      .onSet(async (value) => this.internalColourUpdate(value as number));
    this.cacheHue = this.lightService.getCharacteristic(this.hapChar.Hue).value as number;
    this.cacheSat = this.lightService.getCharacteristic(this.hapChar.Saturation).value as number;

    // Output the customised options to the log
    this.logInitOptions({});

    this.initialised = true;
  }

  private async internalStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      if (this.cacheState === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'stateHumi',
        value: value ? 1 : 0,
      });

      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);

      // Also turn the light off if turning off
      if (!value && this.cacheLightState === 'on') {
        this.lightService.updateCharacteristic(this.hapChar.On, false);
        this.accessory.log(`current light state [${this.cacheLightState}]`);
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      if (value === 0) {
        return;
      }

      const newValue = this.speed2Value(value);

      if (newValue * 10 === this.cacheSpeed) {
        return;
      }

      const newCode = SPEED_VALUE_CODES[newValue];

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: newCode,
      });

      this.cacheSpeed = newValue * 10;
      this.cacheSpeedRaw = `0${newValue}`;
      this.accessory.log(`${platformLang.curSpeed} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalLightStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      if (this.cacheLightState === newValue) {
        return;
      }

      let hexValues: number[];
      if (value) {
        const newRGB = hs2rgb(this.cacheHue, this.cacheSat);
        hexValues = [0x33, 0x1b, 0x01, this.cacheBright, ...newRGB];
      } else {
        hexValues = [0x33, 0x1b, 0x00];
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: generateCodeFromHexValues(hexValues),
      });

      this.cacheLightState = newValue;
      this.accessory.log(`${platformLang.curLight} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      setTimeout(() => {
        this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLightState === 'on');
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalBrightnessUpdate(value: number): Promise<void> {
    try {
      // Debounce
      const updateKeyBright = generateRandomString(5);
      this.updateKeyBright = updateKeyBright;
      await sleep(350);
      if (updateKeyBright !== this.updateKeyBright) {
        return;
      }

      if (value === this.cacheBright) {
        return;
      }

      const newRGB = hs2rgb(this.cacheHue, this.cacheSat);
      const hexValues = [0x33, 0x1b, 0x01, value, ...newRGB];

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: generateCodeFromHexValues(hexValues),
      });

      // Govee considers 0% brightness to be off
      if (value === 0) {
        setTimeout(() => {
          this.cacheLightState = 'off';
          if (this.lightService.getCharacteristic(this.hapChar.On).value) {
            this.lightService.updateCharacteristic(this.hapChar.On, false);
            this.accessory.log(`${platformLang.curLight} [${this.cacheLightState}]`);
          }
          this.lightService.updateCharacteristic(this.hapChar.Brightness, this.cacheBright);
        }, 1500);
        return;
      }

      this.cacheBright = value;
      this.accessory.log(`${platformLang.curBright} [${value}%]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      setTimeout(() => {
        this.lightService.updateCharacteristic(this.hapChar.Brightness, this.cacheBright);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalColourUpdate(value: number): Promise<void> {
    try {
      // Debounce
      const updateKeyColour = generateRandomString(5);
      this.updateKeyColour = updateKeyColour;
      await sleep(300);
      if (updateKeyColour !== this.updateKeyColour) {
        return;
      }

      if (value === this.cacheHue) {
        return;
      }

      const saturation = this.lightService.getCharacteristic(this.hapChar.Saturation).value as number;
      const newRGB = hs2rgb(value, saturation);
      const hexValues = [0x33, 0x1b, 0x01, this.cacheBright, ...newRGB];

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: generateCodeFromHexValues(hexValues),
      });

      this.cacheHue = value;
      this.cacheSat = saturation;
      this.accessory.log(`${platformLang.curColour} [rgb ${newRGB.join(' ')}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      setTimeout(() => {
        this.lightService.updateCharacteristic(this.hapChar.Hue, this.cacheHue);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check for an ON/OFF change
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
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
      case '0501': {
        // Speed update
        const newSpeedRaw = getTwoItemPosition(hexParts, 4);
        if (this.cacheSpeedRaw !== newSpeedRaw) {
          this.cacheSpeedRaw = newSpeedRaw;
          this.cacheSpeed = Number.parseInt(newSpeedRaw, 10) * 10;
          this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
          this.accessory.log(`${platformLang.curSpeed} [${this.cacheSpeedRaw}]`);
        }
        break;
      }
      case '1b00': // night light off
      case '1b01': { // night light on with brightness and color
        const newNight = deviceFunction === '1b01' ? 'on' : 'off';
        if (newNight !== this.cacheLightState) {
          this.cacheLightState = newNight;
          this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLightState === 'on');
          this.accessory.log(`${platformLang.curLight} [${this.cacheLightState}]`);
        }
        if (deviceFunction === '1b01') {
          const newBright = hexToDecimal(getTwoItemPosition(hexParts, 4));
          if (this.cacheBright !== newBright) {
            this.cacheBright = newBright;
            this.lightService.updateCharacteristic(this.hapChar.Brightness, this.cacheBright);
            this.accessory.log(`${platformLang.curBright} [${this.cacheBright}%]`);
          }
          const newR = hexToDecimal(getTwoItemPosition(hexParts, 5));
          const newG = hexToDecimal(getTwoItemPosition(hexParts, 6));
          const newB = hexToDecimal(getTwoItemPosition(hexParts, 7));
          const hs = rgb2hs(newR, newG, newB);
          if (hs[0] !== this.cacheHue) {
            this.cacheHue = hs[0];
            this.cacheSat = hs[1];
            this.lightService.updateCharacteristic(this.hapChar.Hue, this.cacheHue);
            this.lightService.updateCharacteristic(this.hapChar.Saturation, this.cacheSat);
            this.accessory.log(`${platformLang.curColour} [rgb ${newR} ${newG} ${newB}]`);
          }
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

export default HumidifierH7160Device;
