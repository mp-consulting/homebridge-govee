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
  HEATER_H7130_TEMP_CODES_AUTO,
  HEATER_H7130_TEMP_CODES_HEAT,
  HEATER_TEMP_MIN,
  HEATER_TEMP_MAX,
} from '../catalog/index.js';

// Speed step for rotation speed control
const HEATER_SPEED_STEP = 33;
const HEATER_SPEED_VALUES = [0, 33, 66, 99];
const DEFAULT_TEMP = 20;
const TEMP_WARN_THRESHOLD = 100;

/**
 * Heater 1B device handler for H7130 (with temperature reporting).
 * Uses HeaterCooler service with Fan service for speed control.
 */
export class Heater1bDevice extends GoveeDeviceBase {
  private _service!: Service;
  private fanService!: Service;

  // Cached values
  private cacheMode: 'auto' | 'heat' = 'auto';
  private cacheTemp = DEFAULT_TEMP;
  private cacheTarg = DEFAULT_TEMP;
  private cacheSpeed = HEATER_SPEED_STEP;
  private cacheSwing: 'on' | 'off' = 'off';
  private cacheLock: 'on' | 'off' = 'off';
  private cacheFanState: 'on' | 'off' = 'off';

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove old services
    this.removeServiceIfExists('Lightbulb');
    this.removeServiceIfExists('Fanv2');

    // Add the HeaterCooler service
    let heaterService = this.accessory.getService(this.hapServ.HeaterCooler);
    if (!heaterService) {
      heaterService = this.accessory.addService(this.hapServ.HeaterCooler);
      heaterService.updateCharacteristic(this.hapChar.CurrentTemperature, DEFAULT_TEMP);
      heaterService.updateCharacteristic(this.hapChar.HeatingThresholdTemperature, DEFAULT_TEMP);
    }
    this._service = heaterService;

    // Add the Fan service
    this.fanService = this.accessory.getService(this.hapServ.Fan)
      || this.accessory.addService(this.hapServ.Fan);

    // Set up HeaterCooler Active characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off';

    // Set up Target Heater Cooler State
    this._service
      .getCharacteristic(this.hapChar.TargetHeaterCoolerState)
      .setProps({
        minValue: 0,
        maxValue: 1,
        validValues: [0, 1],
      })
      .onSet(async (value) => this.internalModeUpdate(value as number));
    this.cacheMode = this._service.getCharacteristic(this.hapChar.TargetHeaterCoolerState).value === 0 ? 'auto' : 'heat';

    this.cacheTemp = this._service.getCharacteristic(this.hapChar.CurrentTemperature).value as number;

    // Set up Heating Threshold Temperature
    this._service
      .getCharacteristic(this.hapChar.HeatingThresholdTemperature)
      .setProps({
        minValue: HEATER_TEMP_MIN,
        maxValue: HEATER_TEMP_MAX,
        minStep: 1,
      })
      .onSet(async (value) => this.internalTempUpdate(value as number));
    this.cacheTarg = this._service.getCharacteristic(this.hapChar.HeatingThresholdTemperature).value as number;

    // Set up Swing Mode
    this._service
      .getCharacteristic(this.hapChar.SwingMode)
      .onSet(async (value) => this.internalSwingUpdate(value as number));
    this.cacheSwing = this._service.getCharacteristic(this.hapChar.SwingMode).value === 1 ? 'on' : 'off';

    // Set up Lock Physical Controls
    this._service
      .getCharacteristic(this.hapChar.LockPhysicalControls)
      .onSet(async (value) => this.internalLockUpdate(value as number));
    this.cacheLock = this._service.getCharacteristic(this.hapChar.LockPhysicalControls).value === 1 ? 'on' : 'off';

    // Set up Fan On characteristic
    this.fanService
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalFanStateUpdate(value as boolean));
    this.cacheFanState = this.fanService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Set up Fan Rotation Speed
    this.fanService
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        minStep: HEATER_SPEED_STEP,
        validValues: HEATER_SPEED_VALUES,
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this.fanService.getCharacteristic(this.hapChar.RotationSpeed).value as number;

    // Output the customised options to the log
    this.logInitOptions({ tempReporting: true });

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

      // Fan state should also match
      if (this.cacheFanState !== newValue) {
        this.cacheFanState = newValue;
        this.fanService.updateCharacteristic(this.hapChar.On, newValue === 'on');
      }
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.Active),
        this.cacheState === 'on' ? 1 : 0,
      );
    }
  }

  private async internalModeUpdate(value: number): Promise<void> {
    try {
      const newMode: 'auto' | 'heat' = value === 0 ? 'auto' : 'heat';

      if (this.cacheMode === newMode) {
        return;
      }

      const objectToChoose = newMode === 'auto' ? HEATER_H7130_TEMP_CODES_AUTO : HEATER_H7130_TEMP_CODES_HEAT;

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: objectToChoose[this.cacheTemp],
      });

      this.cacheMode = newMode;
      this.accessory.log(`${platformLang.curMode} [${newMode}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.TargetHeaterCoolerState),
        this.cacheMode === 'auto' ? 0 : 1,
      );
    }
  }

  private async internalTempUpdate(value: number): Promise<void> {
    try {
      if (this.cacheTarg === value) {
        return;
      }

      const objectToChoose = this.cacheMode === 'auto' ? HEATER_H7130_TEMP_CODES_AUTO : HEATER_H7130_TEMP_CODES_HEAT;

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: objectToChoose[value],
      });

      this.cacheTarg = value;
      this.accessory.log(`${platformLang.curTarg} [${this.cacheTarg}°C]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.HeatingThresholdTemperature),
        this.cacheTarg,
      );
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
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.SwingMode),
        this.cacheSwing === 'on' ? 1 : 0,
      );
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
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.LockPhysicalControls),
        this.cacheLock === 'on' ? 1 : 0,
      );
    }
  }

  private async internalFanStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value ? 'on' : 'off';

      if (this.cacheFanState === newValue) {
        return;
      }

      // Turning the fan on should only be possible if the main heater is off
      if (newValue === 'on') {
        setTimeout(() => {
          this.fanService.updateCharacteristic(this.hapChar.On, false);
        }, 3000);
        return;
      }

      // Turning fan off: revert to the previous fan speed
      setTimeout(() => {
        this.fanService.updateCharacteristic(this.hapChar.On, true);
        this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      }, 2000);
    } catch (err) {
      this.handleUpdateError(
        err,
        this.fanService.getCharacteristic(this.hapChar.On),
        this.cacheFanState === 'on',
      );
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      if (this.cacheSpeed === value || value === 0) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: HEATER_H7130_SPEED_CODES[value],
      });

      this.cacheSpeed = value;
      this.accessory.log(`${platformLang.curSpeed} [${HEATER_SPEED_LABELS[value]}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this.fanService.getCharacteristic(this.hapChar.RotationSpeed),
        this.cacheSpeed,
      );
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Update the active characteristic
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on');
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);

      // Fan state should also match
      if (this.cacheFanState !== this.cacheState) {
        this.cacheFanState = this.cacheState;
        this.fanService.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
      }
    }

    // Update the current temperature
    if (hasProperty(params, 'temperature')) {
      const newTemp = nearestHalf(farToCen(params.temperature! / TEMP_WARN_THRESHOLD));
      if (newTemp !== this.cacheTemp) {
        if (newTemp > TEMP_WARN_THRESHOLD) {
          this.accessory.logWarn('you should disable `tempReporting` in the config for this device');
        } else {
          this.cacheTemp = newTemp;
          this._service.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp);
          this.accessory.log(`${platformLang.curTemp} [${this.cacheTemp}°C]`);
        }
      }
    }

    // Update the target temperature
    if (hasProperty(params, 'setTemperature')) {
      const newTemp = Math.round(farToCen(params.setTemperature! / TEMP_WARN_THRESHOLD));
      if (newTemp !== this.cacheTarg) {
        this.cacheTarg = newTemp;
        this._service.updateCharacteristic(this.hapChar.HeatingThresholdTemperature, this.cacheTarg);
        this.accessory.log(`${platformLang.curTarg} [${this.cacheTarg}°C]`);
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
          '1a00': (hexParts) => this.handleModeExternalUpdate(hexParts),
          '1a01': (hexParts) => this.handleModeExternalUpdate(hexParts),
          '1100': () => {}, // Timer - ignore
          '1101': () => {}, // Timer - ignore
          '1300': () => {}, // Scheduling - ignore
          '1600': () => {}, // DND - ignore
          '1601': () => {}, // DND - ignore
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

    if (this.cacheState === 'on' && this.cacheFanState !== 'on') {
      this.cacheFanState = 'on';
      this.fanService.updateCharacteristic(this.hapChar.On, true);
      this.accessory.log(`${platformLang.curMode} [${this.cacheFanState}]`);
    }
    if (this.cacheSpeed !== newSpeed) {
      this.cacheSpeed = newSpeed;
      this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      this.accessory.log(`${platformLang.curSpeed} [${HEATER_SPEED_LABELS[this.cacheSpeed]}]`);
    }
  }

  private handleModeExternalUpdate(hexParts: string[]): void {
    const newMode: 'auto' | 'heat' = getTwoItemPosition(hexParts, 3) === '01' ? 'auto' : 'heat';
    if (this.cacheMode !== newMode) {
      this.cacheMode = newMode;
      this._service.updateCharacteristic(this.hapChar.TargetHeaterCoolerState, this.cacheMode === 'auto' ? 0 : 1);
      this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
    }
  }
}

export default Heater1bDevice;
