import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  farToCen,
  getTwoItemPosition,
  hasProperty,
  nearestHalf,
  processCommands,
} from '../utils/functions.js';
import {
  DEVICE_STATE_CODES,
  HEATER_SWING_CODES,
  LOCK_CODES,
  HEATER_H7130_SPEED_CODES,
  HEATER_SPEED_LABELS,
} from '../catalog/index.js';

// Speed step and valid values
const HEATER_SPEED_STEP = 33;
const HEATER_SPEED_VALUES = [0, 33, 66, 99];

// Temperature threshold for reporting warning
const TEMP_THRESHOLD = 100;

/**
 * Heater 1A device handler for H7130 (without temperature reporting).
 * Uses Fanv2 service with Low/Medium/High speed modes.
 */
export class Heater1aDevice extends GoveeDeviceBase {
  private _service!: Service;

  // Cached values
  private cacheSpeed = 33;
  private cacheSwing: 'on' | 'off' = 'off';
  private cacheLock: 'on' | 'off' = 'off';

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove old services
    this.removeServiceIfExists('Lightbulb');
    this.removeServiceIfExists('HeaterCooler');
    this.removeServiceIfExists('Fan');

    // Add the Fanv2 service
    this._service = this.getOrAddService(this.hapServ.Fanv2);

    // Set up Active characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off';

    // Set up Rotation Speed characteristic
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        minStep: HEATER_SPEED_STEP,
        validValues: HEATER_SPEED_VALUES,
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;

    // Set up Swing Mode characteristic (oscillation)
    this._service
      .getCharacteristic(this.hapChar.SwingMode)
      .onSet(async (value) => this.internalSwingUpdate(value as number));
    this.cacheSwing = this._service.getCharacteristic(this.hapChar.SwingMode).value === 1 ? 'on' : 'off';

    // Set up Lock Physical Controls characteristic (child lock)
    this._service
      .getCharacteristic(this.hapChar.LockPhysicalControls)
      .onSet(async (value) => this.internalLockUpdate(value as number));
    this.cacheLock = this._service.getCharacteristic(this.hapChar.LockPhysicalControls).value === 1 ? 'on' : 'off';

    // Output the customised options to the log
    this.logInitOptions({ tempReporting: false });

    this.initialised = true;
  }

  private async internalStateUpdate(value: number): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value === 1 ? 'on' : 'off';
      if (this.cacheState === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: value ? DEVICE_STATE_CODES.on : DEVICE_STATE_CODES.off,
      });

      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(err, this._service.getCharacteristic(this.hapChar.Active), this.cacheState === 'on' ? 1 : 0);
    }
  }

  private async internalSwingUpdate(value: number): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value === 1 ? 'on' : 'off';
      if (this.cacheSwing === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: value ? HEATER_SWING_CODES.on : HEATER_SWING_CODES.off,
      });

      this.cacheSwing = newValue;
      this.accessory.log(`${platformLang.curSwing} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(err, this._service.getCharacteristic(this.hapChar.SwingMode), this.cacheSwing === 'on' ? 1 : 0);
    }
  }

  private async internalLockUpdate(value: number): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value === 1 ? 'on' : 'off';
      if (this.cacheLock === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: value ? LOCK_CODES.on : LOCK_CODES.off,
      });

      this.cacheLock = newValue;
      this.accessory.log(`${platformLang.curLock} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(err, this._service.getCharacteristic(this.hapChar.LockPhysicalControls), this.cacheLock === 'on' ? 1 : 0);
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      if (this.cacheSpeed === value || value === 0) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: HEATER_H7130_SPEED_CODES[value] });

      this.cacheSpeed = value;
      this.accessory.log(`${platformLang.curSpeed} [${HEATER_SPEED_LABELS[value]}]`);
    } catch (err) {
      this.handleUpdateError(err, this._service.getCharacteristic(this.hapChar.RotationSpeed), this.cacheSpeed);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Update the active characteristic
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }

    // Check for temperature (should not be reported for this device)
    if (hasProperty(params, 'temperature')) {
      const newTemp = nearestHalf(farToCen(params.temperature! / TEMP_THRESHOLD));
      if (newTemp <= TEMP_THRESHOLD) {
        // Device must be one that DOES support ambient temperature
        this.accessory.logWarn('you should enable `tempReporting` in the config for this device');
      }
    }

    if (params.commands) {
      processCommands(
        params.commands,
        {
          '1800': (hexParts) => this.handleSwingExternalUpdate(hexParts),
          '1801': (hexParts) => this.handleSwingExternalUpdate(hexParts),
          '1000': (hexParts) => this.handleLockExternalUpdate(hexParts),
          '1001': (hexParts) => this.handleLockExternalUpdate(hexParts),
          '0501': (hexParts) => this.handleSpeedExternalUpdate(hexParts),
          '0502': (hexParts) => this.handleSpeedExternalUpdate(hexParts),
          '0503': (hexParts) => this.handleSpeedExternalUpdate(hexParts),
          '1a00': () => {}, // Target temperature - ignore
          '1a01': () => {}, // Target temperature - ignore
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleSwingExternalUpdate(hexParts: string[]): void {
    const newSwing: 'on' | 'off' = getTwoItemPosition(hexParts, 3) === '01' ? 'on' : 'off';
    if (this.cacheSwing !== newSwing) {
      this.cacheSwing = newSwing;
      this._service.updateCharacteristic(this.hapChar.SwingMode, this.cacheSwing === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curSwing} [${this.cacheSwing}]`);
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

  private handleSpeedExternalUpdate(hexParts: string[]): void {
    const speedByte = getTwoItemPosition(hexParts, 3);
    // Map hex speed byte to percentage: 01=33%, 02=66%, 03=99%
    const speedByteMap: Record<string, number> = {
      '01': HEATER_SPEED_VALUES[1],
      '02': HEATER_SPEED_VALUES[2],
      '03': HEATER_SPEED_VALUES[3],
    };
    const newSpeed = speedByteMap[speedByte];
    if (newSpeed === undefined) {
      return;
    }
    if (this.cacheSpeed !== newSpeed) {
      this.cacheSpeed = newSpeed;
      this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      this.accessory.log(`${platformLang.curSpeed} [${HEATER_SPEED_LABELS[this.cacheSpeed]}]`);
    }
  }
}

export default Heater1aDevice;
