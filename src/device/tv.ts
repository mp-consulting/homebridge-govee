import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { generateRandomString } from '../utils/functions.js';

/**
 * TV device handler.
 * Exposes as a Television service for audio/box/stick devices.
 */
export class TVDevice extends GoveeDeviceBase {
  private _service!: Service;
  private updateTimeout: string | false = false;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Add the Television service
    this._service = this.accessory.getService(this.hapServ.Television)
      || this.accessory.addService(this.hapServ.Television);

    // Set up Active characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off';

    // Output the customised options to the log
    this.logInitOptions({ showAs: 'audio/box/stick' });

    this.initialised = true;
  }

  private async internalStateUpdate(value: number): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value === 1 ? 'on' : 'off';

      if (newValue === this.cacheState) {
        return;
      }

      // Set up a one-minute timeout for the plugin to ignore incoming updates
      const timerKey = generateRandomString(5);
      this.updateTimeout = timerKey;
      setTimeout(() => {
        if (this.updateTimeout === timerKey) {
          this.updateTimeout = false;
        }
      }, 60000);

      await this.sendDeviceUpdate({
        cmd: 'stateOutlet',
        value: newValue,
      });

      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.Active),
        this.cacheState === 'on' ? 1 : 0,
      );
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }
  }
}

export default TVDevice;
