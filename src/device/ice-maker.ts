import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { getTwoItemPosition, processCommands } from '../utils/functions.js';

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
    this._service = this.getOrAddService(this.hapServ.Switch);

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
      this.handleUpdateError(err, this._service.getCharacteristic(this.hapChar.On), this.cacheState === 'on');
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    if (params.commands) {
      processCommands(
        params.commands,
        {
          '19': (hexParts) => this.handleStateUpdate(hexParts),
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleStateUpdate(hexParts: string[]): void {
    const newState: 'on' | 'off' = getTwoItemPosition(hexParts, 3) === '01' ? 'on' : 'off';
    if (this.cacheState !== newState) {
      this.cacheState = newState;
      this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }
  }
}

export default IceMakerDevice;
