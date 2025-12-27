import type { Service, HAPStatus } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { parseError } from '../utils/functions.js';

/**
 * Light Switch device handler.
 * Exposes as a Switch service (removes Lightbulb service if present).
 */
export class LightSwitchDevice extends GoveeDeviceBase {
  private _service!: Service;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove any lightbulb service
    const existingLightbulb = this.accessory.getService(this.hapServ.Lightbulb);
    if (existingLightbulb) {
      this.accessory.removeService(existingLightbulb);
    }

    // Add the Switch service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.Switch)
      || this.accessory.addService(this.hapServ.Switch);

    // Set up On characteristic
    this._service
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalStateUpdate(value as boolean));
    this.cacheState = this._service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Output the customised options to the log
    this.logInitOptions({ showAs: 'switch' });

    this.initialised = true;
  }

  private async internalStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value ? 'on' : 'off';

      if (newValue === this.cacheState) {
        return;
      }

      // Uses 'state' command instead of 'stateOutlet'
      await this.sendDeviceUpdate({
        cmd: 'state',
        value: newValue,
      });

      this.cacheState = newValue;
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
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }
  }
}

export default LightSwitchDevice;
