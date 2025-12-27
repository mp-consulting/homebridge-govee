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

// Speed codes for H7142 model (9 speeds)
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
 * Humidifier device handler for H7142 model.
 * Supports on/off, 9-speed control, humidity sensor, RGB night light, and UV light.
 */
export class HumidifierH7142Device extends GoveeDeviceBase {
  private _service!: Service;
  private humiService!: Service;
  private lightService!: Service;

  // Cached values
  private cacheSpeed = 0;
  private cacheSpeedRaw = '01';
  private cacheMode: 'manual' | 'custom' | 'auto' = 'manual';
  private cacheLightState: 'on' | 'off' = 'off';
  private cacheBright = 100;
  private cacheHue = 0;
  private cacheSat = 0;
  private cacheHumi = 0;
  private cacheUV: 'on' | 'off' = 'off';
  private cacheDisplay: 'on' | 'off' = 'off';

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

    // Add humidity sensor service
    this.humiService = this.getOrAddService(this.hapServ.HumiditySensor);

    // Add the night light service
    this.lightService = this.getOrAddService(this.hapServ.Lightbulb);

    this.cacheHumi = this.humiService.getCharacteristic(this.hapChar.CurrentRelativeHumidity).value as number;

    // Fan on/off characteristic
    this._service
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalStateUpdate(value as boolean));
    this.cacheState = this._service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';
    this.cacheUV = this.cacheState;

    // Rotation speed (9 speeds at 10% increments)
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({ minStep: 10, validValues: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;
    this.cacheSpeedRaw = `0${this.cacheSpeed / 10}`;

    // Lightbulb on/off characteristic
    this.lightService.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalLightStateUpdate(value as boolean);
    });
    this.cacheLightState = this.lightService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Lightbulb brightness
    this.lightService.getCharacteristic(this.hapChar.Brightness).onSet(async (value) => {
      await this.internalBrightnessUpdate(value as number);
    });
    this.cacheBright = this.lightService.getCharacteristic(this.hapChar.Brightness).value as number;

    // Lightbulb hue
    this.lightService.getCharacteristic(this.hapChar.Hue).onSet(async (value) => {
      await this.internalColourUpdate(value as number);
    });
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

      // If turning on, also turn on the UV light
      if (value && this.cacheUV === 'off') {
        await sleep(200);
        await this.sendDeviceUpdate({ cmd: 'ptReal', value: 'MxoBAAAAAAAAAAAAAAAAAAAAACg=' });
      }

      if (this.cacheState !== newValue) {
        this.cacheState = newValue;
        this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
      }
      if (this.cacheUV !== newValue) {
        this.cacheUV = newValue;
        this.accessory.log(`current uv light [${this.cacheUV}]`);
      }

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

      // Generate the hex values for the code
      let hexValues: number[];
      if (value) {
        const newRGB = hs2rgb(
          this.lightService.getCharacteristic(this.hapChar.Hue).value as number,
          this.lightService.getCharacteristic(this.hapChar.Saturation).value as number,
        );
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
      // Debounce when sliding the brightness scale
      const updateKeyBright = generateRandomString(5);
      this.updateKeyBright = updateKeyBright;
      await sleep(350);
      if (updateKeyBright !== this.updateKeyBright) {
        return;
      }

      if (value === this.cacheBright || value === 0) {
        return;
      }

      const newRGB = hs2rgb(
        this.lightService.getCharacteristic(this.hapChar.Hue).value as number,
        this.lightService.getCharacteristic(this.hapChar.Saturation).value as number,
      );
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

      if (this.cacheBright !== value) {
        this.cacheBright = value;
        this.accessory.log(`${platformLang.curBright} [${value}%]`);
      }
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
      // Debounce when sliding the colour wheel
      const updateKeyColour = generateRandomString(5);
      this.updateKeyColour = updateKeyColour;
      await sleep(300);
      if (updateKeyColour !== this.updateKeyColour) {
        return;
      }

      if (value === this.cacheHue) {
        return;
      }

      const newRGB = hs2rgb(
        value,
        this.lightService.getCharacteristic(this.hapChar.Saturation).value as number,
      );
      const hexValues = [0x33, 0x1b, 0x01, this.cacheBright, ...newRGB];

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: generateCodeFromHexValues(hexValues) });

      if (this.cacheHue !== value) {
        this.cacheHue = value;
        this.accessory.log(`${platformLang.curColour} [rgb ${newRGB.join(' ')}]`);
      }
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
          '0500': (hexParts) => this.handleModeUpdate(hexParts),
          '0501': (hexParts) => this.handleSpeedExternalUpdate(hexParts),
          '1001': (hexParts) => this.handleHumidityUpdate(hexParts),
          '1800': () => this.handleDisplayUpdate('off'),
          '1801': () => this.handleDisplayUpdate('on'),
          '1a00': () => this.handleUVUpdate('off'),
          '1a01': () => this.handleUVUpdate('on'),
          '1b00': (hexParts) => this.handleNightLightUpdate('off', hexParts),
          '1b01': (hexParts) => this.handleNightLightUpdate('on', hexParts),
          // Ignored commands
          '0502': () => {}, // custom mode
          '0503': () => {}, // auto mode
          '1100': () => {}, // timer
          '1101': () => {}, // timer
          '1300': () => {}, // scheduling
          '1500': () => {}, // scheduling
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleModeUpdate(hexParts: string[]): void {
    const newModeRaw = getTwoItemPosition(hexParts, 4);
    const modeMap: Record<string, 'manual' | 'custom' | 'auto'> = {
      '01': 'manual',
      '02': 'custom',
      '03': 'auto',
    };
    const newMode = modeMap[newModeRaw];
    if (newMode && this.cacheMode !== newMode) {
      this.cacheMode = newMode;
      this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
    }
  }

  private handleSpeedExternalUpdate(hexParts: string[]): void {
    const newSpeedRaw = getTwoItemPosition(hexParts, 4);
    if (newSpeedRaw !== this.cacheSpeedRaw) {
      this.cacheSpeedRaw = newSpeedRaw;
      this.cacheSpeed = Number.parseInt(newSpeedRaw, 10) * 10;
      this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      this.accessory.log(`${platformLang.curSpeed} [${this.cacheSpeed}]`);
    }
  }

  private handleHumidityUpdate(hexParts: string[]): void {
    const humiCheck = getTwoItemPosition(hexParts, 4);
    if (humiCheck === '00') {
      const newHumiHex = `${getTwoItemPosition(hexParts, 5)}${getTwoItemPosition(hexParts, 6)}`;
      const newHumiDec = Math.round(hexToDecimal(newHumiHex)) / 10;
      const newHumiHKValue = Math.round(newHumiDec);
      if (newHumiHKValue !== this.cacheHumi) {
        this.cacheHumi = newHumiHKValue;
        this.humiService.updateCharacteristic(this.hapChar.CurrentRelativeHumidity, this.cacheHumi);
        this.accessory.log(`${platformLang.curHumi} [${this.cacheHumi}%]`);
      }
    }
  }

  private handleDisplayUpdate(newDisplay: 'on' | 'off'): void {
    if (newDisplay !== this.cacheDisplay) {
      this.cacheDisplay = newDisplay;
      this.accessory.log(`${platformLang.curDisplay} [${this.cacheDisplay}]`);
    }
  }

  private handleUVUpdate(newUV: 'on' | 'off'): void {
    if (newUV !== this.cacheUV) {
      this.cacheUV = newUV;
      this.accessory.log(`current uv light [${this.cacheUV}]`);
    }
  }

  private handleNightLightUpdate(newState: 'on' | 'off', hexParts: string[]): void {
    if (newState !== this.cacheLightState) {
      this.cacheLightState = newState;
      this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLightState === 'on');
      this.accessory.log(`current night light state [${this.cacheLightState}]`);
    }

    // Brightness and colour
    if (this.cacheLightState === 'on') {
      const newBrightHex = getTwoItemPosition(hexParts, 4);
      const newBrightDec = Math.round(hexToDecimal(newBrightHex));
      if (newBrightDec !== this.cacheBright) {
        this.cacheBright = newBrightDec;
        this.lightService.updateCharacteristic(this.hapChar.Brightness, this.cacheBright);
        this.accessory.log(`${platformLang.curBright} [${this.cacheBright}%]`);
      }

      const newR = hexToDecimal(getTwoItemPosition(hexParts, 5));
      const newG = hexToDecimal(getTwoItemPosition(hexParts, 6));
      const newB = hexToDecimal(getTwoItemPosition(hexParts, 7));
      const hs = rgb2hs(newR, newG, newB);

      if (hs[0] !== this.cacheHue) {
        this.lightService.updateCharacteristic(this.hapChar.Hue, hs[0]);
        this.lightService.updateCharacteristic(this.hapChar.Saturation, hs[1]);
        [this.cacheHue] = hs;
        this.accessory.log(`${platformLang.curColour} [rgb ${newR} ${newG} ${newB}]`);
      }
    }
  }
}

export default HumidifierH7142Device;
