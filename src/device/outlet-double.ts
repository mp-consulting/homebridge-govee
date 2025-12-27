import type { Service, HAPStatus } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { parseError } from '../utils/functions.js';

// Command values for dual outlet control
// 51 turns BOTH ON
// 48 turns BOTH OFF
// 34 turns outlet 2 ON
// 32 turns outlet 2 OFF
// 17 turns outlet 1 ON
// 16 turns outlet 1 OFF
const OUTLET_COMMANDS = {
  outlet1On: 17,
  outlet1Off: 16,
  outlet2On: 34,
  outlet2Off: 32,
} as const;

/**
 * Double outlet device handler.
 * Exposes two outlets as separate HomeKit accessories.
 */
export class OutletDoubleDevice extends GoveeDeviceBase {
  private service1!: Service & { cacheState?: 'on' | 'off' };
  private service2!: Service & { cacheState?: 'on' | 'off' };

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this.service1;
  }

  init(): void {
    // Remove switch services if they exist
    const switch1 = this.accessory.getService('Switch 1');
    if (switch1) {
      this.accessory.removeService(switch1);
    }
    const switch2 = this.accessory.getService('Switch 2');
    if (switch2) {
      this.accessory.removeService(switch2);
    }

    // Add the outlet services if they don't already exist
    this.service1 = (this.accessory.getService('Outlet 1')
      || this.accessory.addService(this.hapServ.Outlet, 'Outlet 1', 'outlet1')) as Service & { cacheState?: 'on' | 'off' };
    this.service2 = (this.accessory.getService('Outlet 2')
      || this.accessory.addService(this.hapServ.Outlet, 'Outlet 2', 'outlet2')) as Service & { cacheState?: 'on' | 'off' };

    // Configure service 1
    this.setupOutletService(this.service1, 'Outlet 1', 1);

    // Configure service 2
    this.setupOutletService(this.service2, 'Outlet 2', 2);

    // Add the set handler to the outlets
    this.service1.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalStateUpdate(
        this.service1,
        value ? OUTLET_COMMANDS.outlet1On : OUTLET_COMMANDS.outlet1Off
      );
    });
    this.service1.cacheState = this.service1.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    this.service2.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalStateUpdate(
        this.service2,
        value ? OUTLET_COMMANDS.outlet2On : OUTLET_COMMANDS.outlet2Off
      );
    });
    this.service2.cacheState = this.service2.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Output the customised options to the log
    this.logInitOptions({
      showAs: 'outlet',
    });

    this.initialised = true;
  }

  private setupOutletService(service: Service, name: string, index: number): void {
    if (!service.testCharacteristic(this.hapChar.ConfiguredName)) {
      service.addCharacteristic(this.hapChar.ConfiguredName);
      service.updateCharacteristic(this.hapChar.ConfiguredName, name);
    }
    if (!service.testCharacteristic(this.hapChar.ServiceLabelIndex)) {
      service.addCharacteristic(this.hapChar.ServiceLabelIndex);
      service.updateCharacteristic(this.hapChar.ServiceLabelIndex, index);
    }
  }

  private async internalStateUpdate(
    service: Service & { cacheState?: 'on' | 'off' },
    value: number
  ): Promise<void> {
    try {
      const newValue = value % 16 === 0 ? 'off' : 'on';

      // Don't continue if the new value is the same as before
      if (service.cacheState === newValue) {
        return;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'stateDual',
        value,
      });

      // Cache the new state and log if appropriate
      if (service.cacheState !== newValue) {
        service.cacheState = newValue;
        const serviceName = service.getCharacteristic(this.hapChar.ConfiguredName).value;
        this.accessory.log(`[${serviceName}] ${platformLang.curState} [${newValue}]`);
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        service.updateCharacteristic(this.hapChar.On, service.cacheState === 'on');
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    if (!Array.isArray(params.state)) {
      return;
    }

    const states = params.state as ['on' | 'off', 'on' | 'off'];

    if (states[0] !== this.service1.cacheState) {
      this.service1.cacheState = states[0];
      this.service1.updateCharacteristic(this.hapChar.On, this.service1.cacheState === 'on');

      const serviceName = this.service1.getCharacteristic(this.hapChar.ConfiguredName).value;
      this.accessory.log(`[${serviceName}] ${platformLang.curState} [${this.service1.cacheState}]`);
    }

    if (states[1] !== this.service2.cacheState) {
      this.service2.cacheState = states[1];
      this.service2.updateCharacteristic(this.hapChar.On, this.service2.cacheState === 'on');

      const serviceName = this.service2.getCharacteristic(this.hapChar.ConfiguredName).value;
      this.accessory.log(`[${serviceName}] ${platformLang.curState} [${this.service2.cacheState}]`);
    }
  }
}

export default OutletDoubleDevice;
