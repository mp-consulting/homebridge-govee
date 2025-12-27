import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  base64ToHex,
  generateCodeFromHexValues,
  getTwoItemPosition,
  hexToTwoItems,
  processCommands,
} from '../utils/functions.js';
import {
  DEVICE_STATE_CODES,
  FAN_SWING_CODES,
  FAN_H7102_SPEED_CODES,
  FAN_SPEED_STEP,
} from '../catalog/index.js';

// Speed valid values for HomeKit
const FAN_SPEED_VALUES = [0, 11, 22, 33, 44, 55, 66, 77, 88, 99];
const FAN_AUTO_SPEED = 99;
const FAN_MAX_MANUAL_SPEED = 88;

// Mode byte for auto mode detection
const AUTO_MODE_BYTE = '03';

/**
 * Fan device handler for H7102 model.
 * Supports on/off, speed control, and swing mode.
 */
export class FanDevice extends GoveeDeviceBase {
  private _service!: Service;

  // Speed codes (can be overridden by subclasses)
  protected speedCodes: Record<number, string> = FAN_H7102_SPEED_CODES;

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
    this._service = this.getOrAddService(this.hapServ.Fanv2);

    // Add the set handler to the fan on/off characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value ? 'on' : 'off';

    // Add the set handler to the fan rotation speed characteristic
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        minStep: FAN_SPEED_STEP,
        minValue: 0,
        validValues: FAN_SPEED_VALUES,
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;
    this.cacheMode = this.cacheSpeed === FAN_AUTO_SPEED ? 'auto' : 'manual';

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
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.Active),
        this.cacheState === 'on' ? 1 : 0,
      );
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      if (value < FAN_SPEED_STEP || this.cacheSpeed === value) {
        return;
      }

      let newMode: 'auto' | 'manual' = value === FAN_AUTO_SPEED ? 'auto' : 'manual';
      let newValue = value;

      // Don't continue if trying to access auto mode but there is no sensor attached
      let codeToSend: string;
      if (newMode === 'auto') {
        if (!this.accessory.context.sensorAttached || !this.cacheAutoCode) {
          this.accessory.logWarn('auto mode not supported without a linked sensor');
          codeToSend = this.speedCodes[FAN_MAX_MANUAL_SPEED];
          newMode = 'manual';
          newValue = FAN_MAX_MANUAL_SPEED;
        } else {
          codeToSend = this.cacheAutoCode;
        }
      } else {
        codeToSend = this.speedCodes[value];
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: codeToSend });

      if (this.cacheMode !== newMode) {
        this.cacheMode = newMode;
        this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
      }
      if (this.cacheSpeed !== newValue) {
        this.cacheSpeed = newValue;
        this.accessory.log(`${platformLang.curSpeed} [${newValue}%]`);
      }
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.RotationSpeed),
        this.cacheSpeed,
      );
    }
  }

  private async internalSwingUpdate(value: number): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';
      if (this.cacheSwing === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: value ? FAN_SWING_CODES.on : FAN_SWING_CODES.off,
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

  externalUpdate(params: ExternalUpdateParams): void {
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }

    if (params.commands) {
      // Pre-process for sensor attached check
      for (const command of params.commands) {
        const hexString = base64ToHex(command);
        const hexParts = hexToTwoItems(hexString);
        if (getTwoItemPosition(hexParts, 1) === 'aa' && getTwoItemPosition(hexParts, 2) === '08') {
          const dev = hexString.substring(4, hexString.length - 24);
          this.accessory.context.sensorAttached = dev !== '000000000000';
        }
      }

      processCommands(
        params.commands,
        {
          '0501': (hexParts) => this.handleSpeedUpdate(hexParts),
          '0500': (hexParts) => this.handleModeUpdate(hexParts),
          '0503': (hexParts, hexString) => this.handleAutoCodeUpdate(hexString),
          '1f01': (hexParts) => this.handleSwingUpdate(hexParts),
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleSpeedUpdate(hexParts: string[]): void {
    const newSpeed = getTwoItemPosition(hexParts, 4);
    const newSpeedInt = Number.parseInt(newSpeed, 10) * FAN_SPEED_STEP;
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
  }

  private handleModeUpdate(hexParts: string[]): void {
    // (Guess) Fixed Speed: 1, Custom: 2, Auto: 3, Sleep: 5, Nature: 6, Turbo: 7
    const newMode = getTwoItemPosition(hexParts, 4) === AUTO_MODE_BYTE ? 'auto' : 'manual';
    if (this.cacheMode !== newMode) {
      this.cacheMode = newMode;
      this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);

      if (this.cacheMode === 'auto' && this.cacheSpeed !== FAN_AUTO_SPEED) {
        this.cacheSpeed = FAN_AUTO_SPEED;
        this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
        this.accessory.log(`${platformLang.curSpeed} [${this.cacheSpeed}%]`);
      }
    }
  }

  private handleAutoCodeUpdate(hexString: string): void {
    // Auto mode code - keep this to send it back to the device
    const code = hexToTwoItems(`33${hexString.substring(2, hexString.length - 2)}`);
    this.cacheAutoCode = generateCodeFromHexValues(code.map((p) => Number.parseInt(p, 16))) as string;
  }

  private handleSwingUpdate(hexParts: string[]): void {
    const newSwing = getTwoItemPosition(hexParts, 4) === '01' ? 'on' : 'off';
    if (this.cacheSwing !== newSwing) {
      this.cacheSwing = newSwing;
      this._service.updateCharacteristic(this.hapChar.SwingMode, this.cacheSwing === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curSwing} [${this.cacheSwing}]`);
    }
  }
}

export default FanDevice;
