import type { Service, HAPStatus, CharacteristicValue } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { generateRandomString, parseError } from '../utils/functions.js';

/**
 * Valve device handler.
 * Exposes as a Valve service with irrigation type and timer support.
 */
export class ValveDevice extends GoveeDeviceBase {
  private _service!: Service;
  private updateTimeout: string | false = false;
  private timer?: ReturnType<typeof setTimeout>;

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

    // Make sure this wasn't set up as a different valve type (1 = Irrigation)
    const existingValve = this.accessory.getService(this.hapServ.Valve);
    if (existingValve && this.accessory.context.valveType !== 1) {
      this.accessory.removeService(existingValve);
    }

    // Add the Valve service
    let valveService = this.accessory.getService(this.hapServ.Valve);
    if (!valveService) {
      valveService = this.accessory.addService(this.hapServ.Valve);
      valveService.updateCharacteristic(this.hapChar.Active, 0);
      valveService.updateCharacteristic(this.hapChar.InUse, 0);
      valveService.updateCharacteristic(this.hapChar.ValveType, 1); // Irrigation type
      valveService.updateCharacteristic(this.hapChar.SetDuration, 120);
      valveService.addCharacteristic(this.hapChar.RemainingDuration);
      this.accessory.context.valveType = 1;
    }
    this._service = valveService;

    // Set up Active characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));

    // Set up Set Duration characteristic
    this._service
      .getCharacteristic(this.hapChar.SetDuration)
      .onSet((value: CharacteristicValue) => {
        if (this._service.getCharacteristic(this.hapChar.InUse).value === 1) {
          this._service.updateCharacteristic(this.hapChar.RemainingDuration, value);

          if (this.timer) {
            clearTimeout(this.timer);
          }

          this.timer = setTimeout(() => {
            this._service.setCharacteristic(this.hapChar.Active, 0);
          }, (value as number) * 1000);
        }
      });

    // Output the customised options to the log
    this.logInitOptions({ showAs: 'valve' });

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

      // Update InUse and timer
      this._service.updateCharacteristic(this.hapChar.InUse, value);

      if (value === 0) {
        this._service.updateCharacteristic(this.hapChar.RemainingDuration, 0);
        if (this.timer) {
          clearTimeout(this.timer);
        }
      } else {
        const duration = this._service.getCharacteristic(this.hapChar.SetDuration).value as number;
        this._service.updateCharacteristic(this.hapChar.RemainingDuration, duration);
        this.timer = setTimeout(() => {
          this._service.setCharacteristic(this.hapChar.Active, 0);
        }, duration * 1000);
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;

      if (this.cacheState === 'on') {
        if (this._service.getCharacteristic(this.hapChar.Active).value === 0) {
          const duration = this._service.getCharacteristic(this.hapChar.SetDuration).value as number;
          this._service.updateCharacteristic(this.hapChar.Active, 1);
          this._service.updateCharacteristic(this.hapChar.InUse, 1);
          this._service.updateCharacteristic(this.hapChar.RemainingDuration, duration);
          this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);

          this.timer = setTimeout(() => {
            this._service.setCharacteristic(this.hapChar.Active, 0);
          }, duration * 1000);
        }
      } else {
        this._service.updateCharacteristic(this.hapChar.Active, 0);
        this._service.updateCharacteristic(this.hapChar.InUse, 0);
        this._service.updateCharacteristic(this.hapChar.RemainingDuration, 0);
        if (this.timer) {
          clearTimeout(this.timer);
        }
      }
    }
  }
}

export default ValveDevice;
