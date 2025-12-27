import type { Service, HAPStatus } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  base64ToHex,
  getTwoItemPosition,
  hexToTwoItems,
  parseError,
} from '../utils/functions.js';

/**
 * Dehumidifier device handler for H7150/H7151.
 * Exposes as a Fan service with rotation speed control.
 */
export class DehumidifierDevice extends GoveeDeviceBase {
  private _service!: Service;

  // Speed codes (1-8 levels)
  private readonly value2Code: Record<number, string> = {
    1: 'MwUBAQAAAAAAAAAAAAAAAAAAADY=',
    2: 'MwUBAgAAAAAAAAAAAAAAAAAAADU=',
    3: 'MwUBAwAAAAAAAAAAAAAAAAAAADQ=',
    4: 'MwUBBAAAAAAAAAAAAAAAAAAAADM=',
    5: 'MwUBBQAAAAAAAAAAAAAAAAAAADI=',
    6: 'MwUBBgAAAAAAAAAAAAAAAAAAADE=',
    7: 'MwUBBwAAAAAAAAAAAAAAAAAAADA=',
    8: 'MwUBCAAAAAAAAAAAAAAAAAAAAD8=',
  };

  // Cached values
  private cacheSpeed = 10;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  /**
   * Convert rotation speed percentage to Govee value (1-8)
   */
  private speed2Value(speed: number): number {
    return Math.min(Math.max(Math.round(speed / 10), 1), 8);
  }

  init(): void {
    // Add the Fan service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.Fan)
      || this.accessory.addService(this.hapServ.Fan);

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

      await this.sendDeviceUpdate({
        cmd: 'stateHumi',
        value: value ? 1 : 0,
      });

      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      // Don't continue if the speed is 0
      if (value === 0) {
        return;
      }

      // Get the single Govee value (1-8)
      const newValue = this.speed2Value(value);

      // Don't continue if the speed value won't have effect
      if (newValue * 10 === this.cacheSpeed) {
        return;
      }

      // Get the scene code for this value
      const newCode = this.value2Code[newValue];

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: newCode,
      });

      this.cacheSpeed = newValue * 10;
      this.accessory.log(`${platformLang.curSpeed} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check for an ON/OFF change
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');

      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }

    // Check for command updates
    (params.commands || []).forEach((command: string) => {
      const hexString = base64ToHex(command);
      const hexParts = hexToTwoItems(hexString);

      if (getTwoItemPosition(hexParts, 1) !== 'aa') {
        return;
      }

      const deviceFunction = `${getTwoItemPosition(hexParts, 1)}${getTwoItemPosition(hexParts, 2)}`;

      switch (deviceFunction) {
      default:
        this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        break;
      }
    });
  }
}

export default DehumidifierDevice;
