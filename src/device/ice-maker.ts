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
 * Ice Maker device handler for H7172.
 * Exposes as a Switch service.
 */
export class IceMakerDevice extends GoveeDeviceBase {
  private _service!: Service;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Add the Switch service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.Switch)
      || this.accessory.addService(this.hapServ.Switch);

    // Set up On characteristic
    this._service
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalStateUpdate(value as boolean));
    this.cacheState = this._service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Output the customised options to the log
    this.logInitOptions({});

    this.initialised = true;
  }

  private async internalStateUpdate(value: boolean): Promise<void> {
    try {
      const newState: 'on' | 'off' = value ? 'on' : 'off';

      if (newState === this.cacheState) {
        return;
      }

      // On: Start making ice, Off: Cancel
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: value ? 'MwUCAAAAAAAAAAAAAAAAAAAAADQ=' : 'MxkAAAAAAAAAAAAAAAAAAAAAACo=',
      });

      this.cacheState = newState;
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check for command updates
    (params.commands || []).forEach((command: string) => {
      const hexString = base64ToHex(command);
      const hexParts = hexToTwoItems(hexString);

      if (getTwoItemPosition(hexParts, 1) !== 'aa') {
        return;
      }

      const deviceFunction = `${getTwoItemPosition(hexParts, 1)}${getTwoItemPosition(hexParts, 2)}`;

      switch (deviceFunction) {
      case 'aa19': {
        // On/Off
        const newState: 'on' | 'off' = getTwoItemPosition(hexParts, 3) === '01' ? 'on' : 'off';
        if (this.cacheState !== newState) {
          this.cacheState = newState;
          this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
          this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
        }
        break;
      }
      default:
        this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        break;
      }
    });
  }
}

export default IceMakerDevice;
