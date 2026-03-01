import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';

/**
 * Triple outlet device handler.
 * Controls three outlets independently with stateDual command.
 *
 * Command values:
 * - 119: All ON
 * - 112: All OFF
 * - 17: Outlet 1 ON
 * - 16: Outlet 1 OFF
 * - 34: Outlet 2 ON
 * - 32: Outlet 2 OFF
 * - 68: Outlet 3 ON
 * - 64: Outlet 3 OFF
 */
export class OutletTripleDevice extends GoveeDeviceBase {
  private _service1!: Service;
  private _service2!: Service;
  private _service3!: Service;
  private cacheState1: 'on' | 'off' = 'off';
  private cacheState2: 'on' | 'off' = 'off';
  private cacheState3: 'on' | 'off' = 'off';

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service1;
  }

  init(): void {
    // Remove switch services if they exist
    for (const name of ['Switch 1', 'Switch 2', 'Switch 3']) {
      const switchService = this.accessory.getService(name);
      if (switchService) {
        this.accessory.removeService(switchService);
      }
    }

    // Add the outlet services if they don't already exist
    this._service1 = this.accessory.getService('Outlet 1')
      || this.accessory.addService(this.hapServ.Outlet, 'Outlet 1', 'outlet1');
    this._service2 = this.accessory.getService('Outlet 2')
      || this.accessory.addService(this.hapServ.Outlet, 'Outlet 2', 'outlet2');
    this._service3 = this.accessory.getService('Outlet 3')
      || this.accessory.addService(this.hapServ.Outlet, 'Outlet 3', 'outlet3');

    // Add the set handlers to the outlet on/off characteristics
    this._service1.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalStateUpdate(1, value as boolean);
    });
    this.cacheState1 = this._service1.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    this._service2.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalStateUpdate(2, value as boolean);
    });
    this.cacheState2 = this._service2.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    this._service3.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalStateUpdate(3, value as boolean);
    });
    this.cacheState3 = this._service3.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Output the customised options to the log
    this.logInitOptions({ showAs: 'outlet' });

    this.initialised = true;
  }

  private async internalStateUpdate(outletNum: 1 | 2 | 3, value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';
      const service = this.getServiceByNum(outletNum);
      const currentCache = this.getCacheByNum(outletNum);

      // Don't continue if the new value is the same as before
      if (currentCache === newValue) {
        return;
      }

      // Calculate command value
      // Outlet 1: 17 = ON, 16 = OFF
      // Outlet 2: 34 = ON, 32 = OFF
      // Outlet 3: 68 = ON, 64 = OFF
      let commandValue: number;
      switch (outletNum) {
        case 1:
          commandValue = value ? 17 : 16;
          break;
        case 2:
          commandValue = value ? 34 : 32;
          break;
        case 3:
          commandValue = value ? 68 : 64;
          break;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'stateDual',
        value: commandValue,
      });

      // Cache the new state and log if appropriate
      this.setCacheByNum(outletNum, newValue);

      this.accessory.log(`[${service.displayName}] ${platformLang.curState} [${newValue}]`);
    } catch (err) {
      const service = this.getServiceByNum(outletNum);
      const currentCache = this.getCacheByNum(outletNum);
      this.handleUpdateError(
        err,
        service.getCharacteristic(this.hapChar.On),
        currentCache === 'on',
      );
    }
  }

  private getServiceByNum(num: 1 | 2 | 3): Service {
    switch (num) {
      case 1: return this._service1;
      case 2: return this._service2;
      case 3: return this._service3;
    }
  }

  private getCacheByNum(num: 1 | 2 | 3): 'on' | 'off' {
    switch (num) {
      case 1: return this.cacheState1;
      case 2: return this.cacheState2;
      case 3: return this.cacheState3;
    }
  }

  private setCacheByNum(num: 1 | 2 | 3, value: 'on' | 'off'): void {
    switch (num) {
      case 1: this.cacheState1 = value; break;
      case 2: this.cacheState2 = value; break;
      case 3: this.cacheState3 = value; break;
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check for stateDual number update
    const stateDual = params.stateDual as number | undefined;
    if (stateDual === undefined) {
      return;
    }

    // Handle all on/off (119 = all on, 112 = all off)
    if ([112, 119].includes(stateDual)) {
      const newState: 'on' | 'off' = stateDual === 119 ? 'on' : 'off';
      this.updateOutletState(1, newState);
      this.updateOutletState(2, newState);
      this.updateOutletState(3, newState);
    }

    // Handle individual outlet states
    if ([16, 17].includes(stateDual)) {
      this.updateOutletState(1, stateDual === 17 ? 'on' : 'off');
    }
    if ([32, 34].includes(stateDual)) {
      this.updateOutletState(2, stateDual === 34 ? 'on' : 'off');
    }
    if ([64, 68].includes(stateDual)) {
      this.updateOutletState(3, stateDual === 68 ? 'on' : 'off');
    }
  }

  private updateOutletState(outletNum: 1 | 2 | 3, newState: 'on' | 'off'): void {
    const currentCache = this.getCacheByNum(outletNum);
    if (newState !== currentCache) {
      this.setCacheByNum(outletNum, newState);
      const service = this.getServiceByNum(outletNum);
      service.updateCharacteristic(this.hapChar.On, newState === 'on');
      this.accessory.log(`[${service.displayName}] ${platformLang.curState} [${newState}]`);
    }
  }
}

export default OutletTripleDevice;
