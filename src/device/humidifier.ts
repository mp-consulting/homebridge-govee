import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  generateNightLightCode,
  generateNightLightOffCode,
  processCommands,
  speedPercentToValue,
  speedValueToPercent,
} from '../utils/functions.js';
import { HUMIDIFIER_H7140_SPEED_CODES } from '../catalog/index.js';

// Use centralized speed codes from catalog
const SPEED_VALUE_CODES = HUMIDIFIER_H7140_SPEED_CODES;
const MAX_SPEED = 8;

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

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Add the fan service
    this._service = this.getOrAddService(this.hapServ.Fan);

    // Add the night light service
    this.lightService = this.getOrAddService(this.hapServ.Lightbulb);

    // Fan on/off characteristic
    this._service
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalStateUpdate(value as boolean));
    this.cacheState = this._service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Rotation speed (8 speeds at 10% increments)
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({ minStep: 10, validValues: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;

    // Lightbulb on/off characteristic
    this.lightService.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalLightStateUpdate(value as boolean);
    });
    this.cacheLightState = this.lightService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

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

      // Generate the night light code
      let code: string;
      if (value) {
        const hue = this.lightService.getCharacteristic(this.hapChar.Hue).value as number;
        const saturation = this.lightService.getCharacteristic(this.hapChar.Saturation).value as number;
        code = generateNightLightCode(this.cacheBright, hue, saturation);
      } else {
        code = generateNightLightOffCode();
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: code });

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
          '1b00': () => this.handleNightLightUpdate('off'),
          '1b01': () => this.handleNightLightUpdate('on'),
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleNightLightUpdate(newState: 'on' | 'off'): void {
    if (newState !== this.cacheLightState) {
      this.cacheLightState = newState;
      this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLightState === 'on');
      this.accessory.log(`current night light state [${this.cacheLightState}]`);
    }
  }
}

export default HumidifierDevice;
