import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';

/**
 * Triple switch device handler.
 * Controls three switches independently with stateDual command.
 *
 * Command values:
 * - 119: All ON
 * - 112: All OFF
 * - 17: Switch 1 ON
 * - 16: Switch 1 OFF
 * - 34: Switch 2 ON
 * - 32: Switch 2 OFF
 * - 68: Switch 3 ON
 * - 64: Switch 3 OFF
 */
export class SwitchTripleDevice extends GoveeDeviceBase {
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
    // Remove outlet services if they exist
    for (const name of ['Outlet 1', 'Outlet 2', 'Outlet 3']) {
      const outlet = this.accessory.getService(name);
      if (outlet) {
        this.accessory.removeService(outlet);
      }
    }

    // Add the switch services if they don't already exist
    this._service1 = this.accessory.getService('Switch 1')
      || this.accessory.addService(this.hapServ.Switch, 'Switch 1', 'switch1');
    this._service2 = this.accessory.getService('Switch 2')
      || this.accessory.addService(this.hapServ.Switch, 'Switch 2', 'switch2');
    this._service3 = this.accessory.getService('Switch 3')
      || this.accessory.addService(this.hapServ.Switch, 'Switch 3', 'switch3');

    // Add the set handlers to the switch on/off characteristics
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
    this.logInitOptions({ showAs: 'switch' });

    this.initialised = true;
  }

  private async internalStateUpdate(switchNum: 1 | 2 | 3, value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';
      const service = this.getServiceByNum(switchNum);
      const currentCache = this.getCacheByNum(switchNum);

      // Don't continue if the new value is the same as before
      if (currentCache === newValue) {
        return;
      }

      // Calculate command value
      // Switch 1: 17 = ON, 16 = OFF
      // Switch 2: 34 = ON, 32 = OFF
      // Switch 3: 68 = ON, 64 = OFF
      let commandValue: number;
      switch (switchNum) {
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
      this.setCacheByNum(switchNum, newValue);

      this.accessory.log(`[${service.displayName}] ${platformLang.curState} [${newValue}]`);
    } catch (err) {
      const service = this.getServiceByNum(switchNum);
      const currentCache = this.getCacheByNum(switchNum);
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

    // Handle both on/off (119 = all on, 112 = all off)
    if ([112, 119].includes(stateDual)) {
      const newState: 'on' | 'off' = stateDual === 119 ? 'on' : 'off';
      this.updateSwitchState(1, newState);
      this.updateSwitchState(2, newState);
      this.updateSwitchState(3, newState);
    }

    // Handle individual switch states
    if ([16, 17].includes(stateDual)) {
      this.updateSwitchState(1, stateDual === 17 ? 'on' : 'off');
    }
    if ([32, 34].includes(stateDual)) {
      this.updateSwitchState(2, stateDual === 34 ? 'on' : 'off');
    }
    if ([64, 68].includes(stateDual)) {
      this.updateSwitchState(3, stateDual === 68 ? 'on' : 'off');
    }
  }

  private updateSwitchState(switchNum: 1 | 2 | 3, newState: 'on' | 'off'): void {
    const currentCache = this.getCacheByNum(switchNum);
    if (newState !== currentCache) {
      this.setCacheByNum(switchNum, newState);
      const service = this.getServiceByNum(switchNum);
      service.updateCharacteristic(this.hapChar.On, newState === 'on');
      this.accessory.log(`[${service.displayName}] ${platformLang.curState} [${newState}]`);
    }
  }
}

export default SwitchTripleDevice;
