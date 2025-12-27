import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { hs2rgb, rgb2hs } from '../utils/colour.js';
import {
  generateCodeFromHexValues,
  generateRandomString,
  getTwoItemPosition,
  hexToDecimal,
  processCommands,
  sleep,
  speedPercentToValue,
  speedValueToPercent,
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

const MAX_SPEED = 9;

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

  init(): void {
    // Add the fan service
    this._service = this.getOrAddService(this.hapServ.Fan);

    // Remove humidity sensor service if it exists (use Fan instead)
    this.removeServiceIfExists('HumiditySensor');

    // Add the night light service
    this.lightService = this.getOrAddService(this.hapServ.Lightbulb);

    // Fan on/off characteristic
    this._service
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalStateUpdate(value as boolean));
    this.cacheState = this._service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Rotation speed (9 speeds at 10% increments)
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({ minStep: 10, validValues: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;
    this.cacheSpeedRaw = `0${Math.round(this.cacheSpeed / 10)}`;

    // Lightbulb on/off
    this.lightService.getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalLightStateUpdate(value as boolean));
    this.cacheLightState = this.lightService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Lightbulb brightness
    this.lightService.getCharacteristic(this.hapChar.Brightness)
      .onSet(async (value) => this.internalBrightnessUpdate(value as number));
    this.cacheBright = this.lightService.getCharacteristic(this.hapChar.Brightness).value as number;

    // Lightbulb hue
    this.lightService.getCharacteristic(this.hapChar.Hue)
      .onSet(async (value) => this.internalColourUpdate(value as number));
    this.cacheHue = this.lightService.getCharacteristic(this.hapChar.Hue).value as number;
    this.cacheSat = this.lightService.getCharacteristic(this.hapChar.Saturation).value as number;

    this.logInitOptions({});
    this.initialised = true;
  }

  private async internalStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';
      if (this.cacheState === newValue) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'stateHumi', value: value ? 1 : 0 });

      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);

      // Also turn the light off if turning off
      if (!value && this.cacheLightState === 'on') {
        this.lightService.updateCharacteristic(this.hapChar.On, false);
        this.accessory.log(`current light state [${this.cacheLightState}]`);
      }
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.On),
        this.cacheState === 'on',
      );
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      if (value === 0) {
        return;
      }

      const newValue = speedPercentToValue(value, MAX_SPEED, Math.round);
      const newPercent = speedValueToPercent(newValue, MAX_SPEED);

      if (newPercent === this.cacheSpeed) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: SPEED_VALUE_CODES[newValue] });

      this.cacheSpeed = newPercent;
      this.cacheSpeedRaw = `0${newValue}`;
      this.accessory.log(`${platformLang.curSpeed} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.RotationSpeed),
        this.cacheSpeed,
      );
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

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: generateCodeFromHexValues(hexValues) });

      this.cacheLightState = newValue;
      this.accessory.log(`${platformLang.curLight} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this.lightService.getCharacteristic(this.hapChar.On),
        this.cacheLightState === 'on',
      );
    }
  }

  private async internalBrightnessUpdate(value: number): Promise<void> {
    try {
      // Debounce when sliding brightness
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

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: generateCodeFromHexValues(hexValues) });

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
      this.handleUpdateError(
        err,
        this.lightService.getCharacteristic(this.hapChar.Brightness),
        this.cacheBright,
      );
    }
  }

  private async internalColourUpdate(value: number): Promise<void> {
    try {
      // Debounce when sliding colour wheel
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

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: generateCodeFromHexValues(hexValues) });

      this.cacheHue = value;
      this.cacheSat = saturation;
      this.accessory.log(`${platformLang.curColour} [rgb ${newRGB.join(' ')}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this.lightService.getCharacteristic(this.hapChar.Hue),
        this.cacheHue,
      );
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }

    if (params.commands) {
      processCommands(
        params.commands,
        {
          '0501': (hexParts) => this.handleSpeedExternalUpdate(hexParts),
          '1b00': (hexParts) => this.handleNightLightUpdate('off', hexParts),
          '1b01': (hexParts) => this.handleNightLightUpdate('on', hexParts),
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleSpeedExternalUpdate(hexParts: string[]): void {
    const newSpeedRaw = getTwoItemPosition(hexParts, 4);
    if (this.cacheSpeedRaw !== newSpeedRaw) {
      this.cacheSpeedRaw = newSpeedRaw;
      this.cacheSpeed = Number.parseInt(newSpeedRaw, 10) * 10;
      this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      this.accessory.log(`${platformLang.curSpeed} [${this.cacheSpeedRaw}]`);
    }
  }

  private handleNightLightUpdate(newState: 'on' | 'off', hexParts: string[]): void {
    if (newState !== this.cacheLightState) {
      this.cacheLightState = newState;
      this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLightState === 'on');
      this.accessory.log(`${platformLang.curLight} [${this.cacheLightState}]`);
    }

    if (newState === 'on') {
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
  }
}

export default HumidifierH7160Device;
