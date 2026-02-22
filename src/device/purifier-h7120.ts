import type { Characteristic, Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  getTwoItemPosition,
  processCommands,
  speedPercentToValue,
  speedValueToPercent,
} from '../utils/functions.js';
import {
  PURIFIER_H7120_SPEED_CODES,
  PURIFIER_H7120_NIGHT_LIGHT_CODES,
  LOCK_CODES,
  DISPLAY_CODES,
} from '../catalog/index.js';

// Use catalog codes
const SPEED_VALUE_CODES = PURIFIER_H7120_SPEED_CODES;
const NIGHT_LIGHT_CODES = PURIFIER_H7120_NIGHT_LIGHT_CODES;

const MAX_SPEED = 4;

/**
 * Purifier device handler for H7120/H7121 models.
 * Supports on/off, 4-speed control, night light, lock, and display light.
 */
export class PurifierH7120Device extends GoveeDeviceBase {
  private _service!: Service;

  // Cached values
  private cacheSpeed = 25;
  private cacheLock: 'on' | 'off' = 'off';
  private cacheLight: 'on' | 'off' = 'off';
  private cacheDisplay: 'on' | 'off' = 'off';

  // Custom characteristics
  private nightLightChar?: Characteristic;
  private displayLightChar?: Characteristic;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    this._service = this.getOrAddService(this.hapServ.AirPurifier);

    // Active characteristic
    this._service.getCharacteristic(this.hapChar.Active).onSet(async (value) => {
      await this.internalStateUpdate(value as number);
    });
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off';

    // Target state (manual only)
    this._service
      .getCharacteristic(this.hapChar.TargetAirPurifierState)
      .updateValue(1)
      .setProps({ minValue: 1, maxValue: 1, validValues: [1] });

    // Rotation speed (4 speeds at 25% increments)
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({ minStep: 25, validValues: [0, 25, 50, 75, 100] })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number || 25;

    // Lock controls
    this._service.getCharacteristic(this.hapChar.LockPhysicalControls).onSet(async (value) => {
      await this.internalLockUpdate(value as number);
    });
    this.cacheLock = this._service.getCharacteristic(this.hapChar.LockPhysicalControls).value === 1 ? 'on' : 'off';

    // Night light custom characteristic
     
    this.nightLightChar = this.addCustomCharacteristic(
      this._service,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.platform.cusChar as any)?.NightLight,
      async (value: boolean) => this.internalNightLightUpdate(value),
    );
    if (this.nightLightChar) {
      this.cacheLight = this.nightLightChar.value ? 'on' : 'off';
    }

    // Display light custom characteristic
     
    this.displayLightChar = this.addCustomCharacteristic(
      this._service,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.platform.cusChar as any)?.DisplayLight,
      async (value: boolean) => this.internalDisplayLightUpdate(value),
    );
    if (this.displayLightChar) {
      this.cacheDisplay = this.displayLightChar.value ? 'on' : 'off';
    }

    this.logInitOptions({});
    this.initialised = true;
  }

  private async internalStateUpdate(value: number): Promise<void> {
    try {
      const newValue = value === 1 ? 'on' : 'off';
      if (this.cacheState === newValue) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'statePuri', value: value ? 1 : 0 });

      this._service.updateCharacteristic(this.hapChar.CurrentAirPurifierState, value === 1 ? 2 : 0);
      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.Active),
        this.cacheState === 'on' ? 1 : 0,
      );
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      if (value === 0) {
        return;
      }

      const newValue = speedPercentToValue(value, MAX_SPEED);
      const newPercent = speedValueToPercent(newValue, MAX_SPEED);

      if (newPercent === this.cacheSpeed) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: SPEED_VALUE_CODES[newValue] });

      this.cacheSpeed = newPercent;
      this.accessory.log(`${platformLang.curSpeed} [${this.cacheSpeed}%]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.RotationSpeed),
        this.cacheSpeed,
      );
    }
  }

  private async internalNightLightUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';
      if (this.cacheLight === newValue) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: NIGHT_LIGHT_CODES[newValue] });

      this.cacheLight = newValue;
      this.accessory.log(`${platformLang.curLight} [${newValue}]`);
    } catch (err) {
      if (this.nightLightChar) {
        this.handleUpdateError(err, this.nightLightChar, this.cacheLight === 'on');
      }
    }
  }

  private async internalLockUpdate(value: number): Promise<void> {
    try {
      const newValue = value === 1 ? 'on' : 'off';
      if (this.cacheLock === newValue) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: LOCK_CODES[newValue] });

      this.cacheLock = newValue;
      this.accessory.log(`${platformLang.curLock} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.LockPhysicalControls),
        this.cacheLock === 'on' ? 1 : 0,
      );
    }
  }

  private async internalDisplayLightUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';
      if (this.cacheDisplay === newValue) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: DISPLAY_CODES[newValue] });

      this.cacheDisplay = newValue;
      this.accessory.log(`${platformLang.curDisplay} [${newValue}]`);
    } catch (err) {
      if (this.displayLightChar) {
        this.handleUpdateError(err, this.displayLightChar, this.cacheDisplay === 'on');
      }
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      this._service.updateCharacteristic(this.hapChar.CurrentAirPurifierState, this.cacheState === 'on' ? 2 : 0);
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }

    if (params.commands) {
      processCommands(
        params.commands,
        {
          '0501': (hexParts) => this.handleSpeedExternalUpdate(hexParts),
          '0502': (hexParts) => this.handleSpeedExternalUpdate(hexParts),
          '1000': (hexParts) => this.handleLockExternalUpdate(hexParts),
          '1001': (hexParts) => this.handleLockExternalUpdate(hexParts),
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleSpeedExternalUpdate(hexParts: string[]): void {
    const speedByte = getTwoItemPosition(hexParts, 3);
    const speedByteMap: Record<string, number> = {
      '01': 25,
      '02': 50,
      '03': 75,
      '04': 100,
    };
    const newSpeed = speedByteMap[speedByte];
    if (newSpeed === undefined) {
      return;
    }
    if (this.cacheSpeed !== newSpeed) {
      this.cacheSpeed = newSpeed;
      this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      this.accessory.log(`${platformLang.curSpeed} [${this.cacheSpeed}%]`);
    }
  }

  private handleLockExternalUpdate(hexParts: string[]): void {
    const newLock: 'on' | 'off' = getTwoItemPosition(hexParts, 3) === '01' ? 'on' : 'off';
    if (this.cacheLock !== newLock) {
      this.cacheLock = newLock;
      this._service.updateCharacteristic(this.hapChar.LockPhysicalControls, this.cacheLock === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curLock} [${this.cacheLock}]`);
    }
  }
}

export default PurifierH7120Device;
