import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { processCommands, speedPercentToValue, speedValueToPercent } from '../utils/functions.js';

/**
 * Dehumidifier device handler for H7150/H7151.
 * Exposes as a Fan service with rotation speed control.
 */
export class DehumidifierDevice extends GoveeDeviceBase {
  private _service!: Service;

  // Speed codes (1-8 levels)
  private readonly speedCodes: Record<number, string> = {
    1: 'MwUBAQAAAAAAAAAAAAAAAAAAADY=',
    2: 'MwUBAgAAAAAAAAAAAAAAAAAAADU=',
    3: 'MwUBAwAAAAAAAAAAAAAAAAAAADQ=',
    4: 'MwUBBAAAAAAAAAAAAAAAAAAAADM=',
    5: 'MwUBBQAAAAAAAAAAAAAAAAAAADI=',
    6: 'MwUBBgAAAAAAAAAAAAAAAAAAADE=',
    7: 'MwUBBwAAAAAAAAAAAAAAAAAAADA=',
    8: 'MwUBCAAAAAAAAAAAAAAAAAAAAD8=',
  };

  private static readonly MAX_SPEED = 8;

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

      const newValue = speedPercentToValue(value, DehumidifierDevice.MAX_SPEED, Math.round);
      const newPercent = speedValueToPercent(newValue, DehumidifierDevice.MAX_SPEED);

      if (newPercent === this.cacheSpeed) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: this.speedCodes[newValue] });

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
        {},
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }
}

export default DehumidifierDevice;
