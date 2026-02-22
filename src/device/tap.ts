import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { generateRandomString } from '../utils/functions.js';

/**
 * Tap device handler.
 * Exposes as a Valve service with tap type.
 */
export class TapDevice extends GoveeDeviceBase {
  private _service!: Service;
  private updateTimeout: string | false = false;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove old services
    const servicesToRemove = ['AirPurifier', 'HeaterCooler', 'Lightbulb', 'Outlet', 'Switch'] as const;
    for (const serviceName of servicesToRemove) {
      this.removeServiceIfExists(serviceName);
    }

    // Make sure this wasn't set up as a different valve type (3 = Faucet/Tap)
    const existingValve = this.accessory.getService(this.hapServ.Valve);
    if (existingValve && this.accessory.context.valveType !== 3) {
      this.accessory.removeService(existingValve);
    }

    // Add the Valve service
    let valveService = this.accessory.getService(this.hapServ.Valve);
    if (!valveService) {
      valveService = this.accessory.addService(this.hapServ.Valve);
      valveService.updateCharacteristic(this.hapChar.Active, 0);
      valveService.updateCharacteristic(this.hapChar.InUse, 0);
      valveService.updateCharacteristic(this.hapChar.ValveType, 3); // Faucet/Tap type
      this.accessory.context.valveType = 3;
    }
    this._service = valveService;

    // Set up Active characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));

    // Output the customised options to the log
    this.logInitOptions({ showAs: 'tap' });

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

      // Update the InUse characteristic
      this._service.updateCharacteristic(this.hapChar.InUse, value);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.Active),
        this.cacheState === 'on' ? 1 : 0,
      );
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Ignore external updates during the debounce window after an internal command
    if (this.updateTimeout) {
      return;
    }

    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      this._service.updateCharacteristic(this.hapChar.InUse, this.cacheState === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }
  }
}

export default TapDevice;
