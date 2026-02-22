import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';

/**
 * Double switch device handler.
 * Controls two switches independently with stateDual command.
 *
 * Command values:
 * - 51: Both ON
 * - 48: Both OFF
 * - 17: Switch 1 ON (channel 1)
 * - 16: Switch 1 OFF (channel 1)
 * - 34: Switch 2 ON (channel 2)
 * - 32: Switch 2 OFF (channel 2)
 */
export class SwitchDoubleDevice extends GoveeDeviceBase {
  private _service1!: Service;
  private _service2!: Service;
  private cacheState1: 'on' | 'off' = 'off';
  private cacheState2: 'on' | 'off' = 'off';

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service1;
  }

  init(): void {
    // Remove outlet services if they exist
    const outlet1 = this.accessory.getService('Outlet 1');
    if (outlet1) {
      this.accessory.removeService(outlet1);
    }
    const outlet2 = this.accessory.getService('Outlet 2');
    if (outlet2) {
      this.accessory.removeService(outlet2);
    }

    // Add the switch services if they don't already exist
    this._service1 = this.accessory.getService('Switch 1')
      || this.accessory.addService(this.hapServ.Switch, 'Switch 1', 'switch1');
    this._service2 = this.accessory.getService('Switch 2')
      || this.accessory.addService(this.hapServ.Switch, 'Switch 2', 'switch2');

    // Add ConfiguredName and ServiceLabelIndex characteristics
    this.setupServiceCharacteristics(this._service1, 'Switch 1', 1);
    this.setupServiceCharacteristics(this._service2, 'Switch 2', 2);

    // Add the set handler to the switch on/off characteristic
    this._service1.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalStateUpdate(1, value as boolean);
    });
    this.cacheState1 = this._service1.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    this._service2.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalStateUpdate(2, value as boolean);
    });
    this.cacheState2 = this._service2.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Output the customised options to the log
    this.logInitOptions({ showAs: 'switch' });

    this.initialised = true;
  }

  private setupServiceCharacteristics(service: Service, name: string, index: number): void {
    if (!service.testCharacteristic(this.hapChar.ConfiguredName)) {
      service.addCharacteristic(this.hapChar.ConfiguredName);
      service.updateCharacteristic(this.hapChar.ConfiguredName, name);
    }
    if (!service.testCharacteristic(this.hapChar.ServiceLabelIndex)) {
      service.addCharacteristic(this.hapChar.ServiceLabelIndex);
      service.updateCharacteristic(this.hapChar.ServiceLabelIndex, index);
    }
  }

  private async internalStateUpdate(switchNum: 1 | 2, value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';
      const service = switchNum === 1 ? this._service1 : this._service2;
      const currentCache = switchNum === 1 ? this.cacheState1 : this.cacheState2;

      // Don't continue if the new value is the same as before
      if (currentCache === newValue) {
        return;
      }

      // Calculate command value
      // Switch 1: 17 = ON, 16 = OFF (channel 1)
      // Switch 2: 34 = ON, 32 = OFF (channel 2)
      let commandValue: number;
      if (switchNum === 1) {
        commandValue = value ? 17 : 16;
      } else {
        commandValue = value ? 34 : 32;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'stateDual',
        value: commandValue,
      });

      // Cache the new state and log if appropriate
      if (switchNum === 1) {
        this.cacheState1 = newValue;
      } else {
        this.cacheState2 = newValue;
      }

      const switchName = service.getCharacteristic(this.hapChar.ConfiguredName).value || `Switch ${switchNum}`;
      this.accessory.log(`[${switchName}] ${platformLang.curState} [${newValue}]`);
    } catch (err) {
      const service = switchNum === 1 ? this._service1 : this._service2;
      const currentCache = switchNum === 1 ? this.cacheState1 : this.cacheState2;
      this.handleUpdateError(
        err,
        service.getCharacteristic(this.hapChar.On),
        currentCache === 'on',
      );
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check for array-based state update
    if (Array.isArray(params.state)) {
      const stateArray = params.state as Array<'on' | 'off'>;
      const state1 = stateArray[0];
      const state2 = stateArray[1];

      if (state1 !== this.cacheState1) {
        this.cacheState1 = state1;
        this._service1.updateCharacteristic(this.hapChar.On, this.cacheState1 === 'on');
        const name1 = this._service1.getCharacteristic(this.hapChar.ConfiguredName).value || 'Switch 1';
        this.accessory.log(`[${name1}] ${platformLang.curState} [${this.cacheState1}]`);
      }

      if (state2 !== this.cacheState2) {
        this.cacheState2 = state2;
        this._service2.updateCharacteristic(this.hapChar.On, this.cacheState2 === 'on');
        const name2 = this._service2.getCharacteristic(this.hapChar.ConfiguredName).value || 'Switch 2';
        this.accessory.log(`[${name2}] ${platformLang.curState} [${this.cacheState2}]`);
      }
    }
  }
}

export default SwitchDoubleDevice;
