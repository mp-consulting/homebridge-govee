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
  PURIFIER_H7127_SPEED_CODES,
  LOCK_CODES,
  DISPLAY_CODES,
} from '../catalog/index.js';

// Use catalog codes
const SPEED_VALUE_CODES = PURIFIER_H7127_SPEED_CODES;

const MAX_SPEED = 3;

/**
 * Purifier device handler for H7127/H7128/H7129/H712C models.
 * Supports on/off, 3-speed control, lock, and display light.
 */
export class PurifierH7127Device extends GoveeDeviceBase {
  private _service!: Service;

  // Cached values
  private cacheSpeed = 0;
  private cacheSpeedRaw = '01';
  private cacheLock: 'on' | 'off' = 'off';
  private cacheDisplay: 'on' | 'off' = 'off';

  // Custom characteristic for display light
  private displayLightChar?: Characteristic;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Add the purifier service
    this._service = this.getOrAddService(this.hapServ.AirPurifier);

    // Active characteristic
    this._service.getCharacteristic(this.hapChar.Active).onSet(async (value) => {
      await this.internalStateUpdate(value as number);
    });
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off';

    // Target state (manual only)
    this._service.getCharacteristic(this.hapChar.TargetAirPurifierState).updateValue(1);

    // Rotation speed (3 speeds)
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({ minStep: 25, validValues: [0, 33, 66, 99] })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;

    // Lock controls
    this._service.getCharacteristic(this.hapChar.LockPhysicalControls).onSet(async (value) => {
      await this.internalLockUpdate(value as number);
    });
    this.cacheLock = this._service.getCharacteristic(this.hapChar.LockPhysicalControls).value === 1 ? 'on' : 'off';

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
          '0501': (hexParts) => this.handleSpeedUpdate(hexParts),
          '1000': () => this.handleLockUpdate('off'),
          '1001': () => this.handleLockUpdate('on'),
          '1600': () => this.handleDisplayUpdate('off'),
          '1601': () => this.handleDisplayUpdate('on'),
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleSpeedUpdate(hexParts: string[]): void {
    const newSpeedRaw = getTwoItemPosition(hexParts, 4);
    if (newSpeedRaw !== this.cacheSpeedRaw) {
      this.cacheSpeedRaw = newSpeedRaw;
      this.cacheSpeed = Number.parseInt(newSpeedRaw, 10) * 10;
      this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      this.accessory.log(`${platformLang.curSpeed} [${this.cacheSpeed}]`);
    }
  }

  private handleLockUpdate(newLock: 'on' | 'off'): void {
    if (newLock !== this.cacheLock) {
      this.cacheLock = newLock;
      this._service.updateCharacteristic(this.hapChar.LockPhysicalControls, this.cacheLock === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curLock} [${this.cacheLock}]`);
    }
  }

  private handleDisplayUpdate(newDisplay: 'on' | 'off'): void {
    if (newDisplay !== this.cacheDisplay) {
      this.cacheDisplay = newDisplay;
      if (this.displayLightChar) {
        this.displayLightChar.updateValue(this.cacheDisplay === 'on');
      }
      this.accessory.log(`${platformLang.curDisplay} [${this.cacheDisplay}]`);
    }
  }
}

export default PurifierH7127Device;
