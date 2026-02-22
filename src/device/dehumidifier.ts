import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { getTwoItemPosition, processCommands, speedPercentToValue, speedValueToPercent } from '../utils/functions.js';
import { HUMIDIFIER_H7140_SPEED_CODES } from '../catalog/index.js';

/**
 * Dehumidifier device handler for H7150/H7151.
 * Exposes as a Fan service with rotation speed control.
 */
// Use centralized speed codes from catalog (same as humidifier)
const SPEED_CODES = HUMIDIFIER_H7140_SPEED_CODES;
const MAX_SPEED = 8;

export class DehumidifierDevice extends GoveeDeviceBase {
  private _service!: Service;

  // Cached values
  private cacheSpeed = 0;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Add the Fan service if it doesn't already exist
    this._service = this.getOrAddService(this.hapServ.Fan);

    // Set up On characteristic
    this._service
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalStateUpdate(value as boolean));
    this.cacheState = this._service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Set up Rotation Speed characteristic (10% steps, 1-8 Govee levels)
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        minStep: 10,
        validValues: [0, 10, 20, 30, 40, 50, 60, 70, 80],
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;

    // Output the customised options to the log
    this.logInitOptions({});

    this.initialised = true;
  }

  private async internalStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value ? 'on' : 'off';
      if (this.cacheState === newValue) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'stateHumi', value: value ? 1 : 0 });

      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(err, this._service.getCharacteristic(this.hapChar.On), this.cacheState === 'on');
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

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: SPEED_CODES[newValue] });

      this.cacheSpeed = newPercent;
      this.accessory.log(`${platformLang.curSpeed} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(err, this._service.getCharacteristic(this.hapChar.RotationSpeed), this.cacheSpeed);
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
          '0502': (hexParts) => this.handleSpeedExternalUpdate(hexParts),
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleSpeedExternalUpdate(hexParts: string[]): void {
    const speedByte = getTwoItemPosition(hexParts, 3);
    const speedValue = Number.parseInt(speedByte, 16);
    if (speedValue < 1 || speedValue > MAX_SPEED) {
      return;
    }
    const newPercent = speedValueToPercent(speedValue, MAX_SPEED);
    if (this.cacheSpeed !== newPercent) {
      this.cacheSpeed = newPercent;
      this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      this.accessory.log(`${platformLang.curSpeed} [${speedValue}]`);
    }
  }
}

export default DehumidifierDevice;
