import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams, EveHistoryService } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { generateRandomString } from '../utils/functions.js';

/**
 * Purifier device handler (simple on/off control).
 * Exposes as an AirPurifier service with Eve history support.
 */
export class PurifierDevice extends GoveeDeviceBase {
  private _service!: Service;

  // Update timeout
  private updateTimeout: string | false = false;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove any old services from simulations
    const servicesToRemove = ['HeaterCooler', 'Lightbulb', 'Outlet', 'Switch', 'Valve'] as const;
    for (const serviceName of servicesToRemove) {
      this.removeServiceIfExists(serviceName);
    }

    // Add the AirPurifier service if it doesn't already exist
    this._service = this.getOrAddService(this.hapServ.AirPurifier);

    // Set up Active characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off';

    // Set up Target Air Purifier State (manual only)
    this._service
      .getCharacteristic(this.hapChar.TargetAirPurifierState)
      .updateValue(1)
      .setProps({
        minValue: 1,
        maxValue: 1,
        validValues: [1],
      });

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('switch', this.accessory, {
      log: () => {},
    }) as unknown as EveHistoryService;

    // Output the customised options to the log
    this.logInitOptions({ showAs: 'purifier' });

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

      await this.sendDeviceUpdate({ cmd: 'stateOutlet', value: newValue });

      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);

      // Add the entry to the Eve history service
      if (this.accessory.eveService) {
        this.accessory.eveService.addEntry({ status: value ? 1 : 0 });
      }
      this._service.updateCharacteristic(this.hapChar.CurrentAirPurifierState, value === 1 ? 2 : 0);
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

    // Check to see if the provided state is different from the cached state
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      this._service.updateCharacteristic(
        this.hapChar.CurrentAirPurifierState,
        this.cacheState === 'on' ? 2 : 0,
      );

      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);

      // Add the entry to the Eve history service
      if (this.accessory.eveService) {
        this.accessory.eveService.addEntry({
          status: this.cacheState === 'on' ? 1 : 0,
        });
      }
    }
  }
}

export default PurifierDevice;
