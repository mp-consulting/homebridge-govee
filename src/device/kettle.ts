import type { Service, HAPStatus } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  base64ToHex,
  getTwoItemPosition,
  hexToTwoItems,
  parseError,
  sleep,
} from '../utils/functions.js';

/**
 * Kettle device handler.
 * Exposes multiple switches for different tea/coffee modes.
 */
export class KettleDevice extends GoveeDeviceBase {
  private _service!: Service;
  private service1?: Service;
  private service2?: Service;
  private service3?: Service;
  private service4?: Service;
  private service5?: Service;
  private service6?: Service;
  private cacheOnBase?: 'yes' | 'no';

  // Mode codes
  private readonly codes: Record<string, string> = {
    greenTea: 'MwUAAgAAAAAAAAAAAAAAAAAAADQ=',
    oolongTea: 'MwUAAwAAAAAAAAAAAAAAAAAAADU=',
    coffee: 'MwUABAAAAAAAAAAAAAAAAAAAADI=',
    blackTea: 'MwUABQAAAAAAAAAAAAAAAAAAADM=',
    customMode1: 'MwUAAQEAAAAAAAAAAAAAAAAAADY=',
    customMode2: 'MwUAAQIAAAAAAAAAAAAAAAAAADU=',
  };

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    const deviceConf = this.platform.deviceConf[this.accessory.context.gvDeviceId] || {};

    // Remove temperature sensor if it exists
    this.removeServiceIfExists('TemperatureSensor');

    // Add a switch service for Green Tea
    this.service1 = this.accessory.getService('Green Tea');
    if (deviceConf.hideModeGreenTea) {
      if (this.service1) {
        this.accessory.removeService(this.service1);
        this.service1 = undefined;
      }
    } else if (!this.service1) {
      this.service1 = this.accessory.addService(this.hapServ.Switch, 'Green Tea', 'greenTea');
      this.service1.addCharacteristic(this.hapChar.ConfiguredName);
      this.service1.updateCharacteristic(this.hapChar.ConfiguredName, 'Green Tea');
      this.service1.addCharacteristic(this.hapChar.ServiceLabelIndex);
      this.service1.updateCharacteristic(this.hapChar.ServiceLabelIndex, 1);
    }

    // Add a switch service for Oolong Tea
    this.service2 = this.accessory.getService('Oolong Tea');
    if (deviceConf.hideModeOolongTea) {
      if (this.service2) {
        this.accessory.removeService(this.service2);
        this.service2 = undefined;
      }
    } else if (!this.service2) {
      this.service2 = this.accessory.addService(this.hapServ.Switch, 'Oolong Tea', 'oolongTea');
      this.service2.addCharacteristic(this.hapChar.ConfiguredName);
      this.service2.updateCharacteristic(this.hapChar.ConfiguredName, 'Oolong Tea');
      this.service2.addCharacteristic(this.hapChar.ServiceLabelIndex);
      this.service2.updateCharacteristic(this.hapChar.ServiceLabelIndex, 2);
    }

    // Add a switch service for Coffee
    this.service3 = this.accessory.getService('Coffee');
    if (deviceConf.hideModeCoffee) {
      if (this.service3) {
        this.accessory.removeService(this.service3);
        this.service3 = undefined;
      }
    } else if (!this.service3) {
      this.service3 = this.accessory.addService(this.hapServ.Switch, 'Coffee', 'coffee');
      this.service3.addCharacteristic(this.hapChar.ConfiguredName);
      this.service3.updateCharacteristic(this.hapChar.ConfiguredName, 'Coffee');
      this.service3.addCharacteristic(this.hapChar.ServiceLabelIndex);
      this.service3.updateCharacteristic(this.hapChar.ServiceLabelIndex, 3);
    }

    // Add a switch service for Black Tea/Boil
    this.service4 = this.accessory.getService('Black Tea/Boil');
    if (deviceConf.hideModeBlackTeaBoil) {
      if (this.service4) {
        this.accessory.removeService(this.service4);
        this.service4 = undefined;
      }
    } else if (!this.service4) {
      this.service4 = this.accessory.addService(this.hapServ.Switch, 'Black Tea/Boil', 'blackTeaBoil');
      this.service4.addCharacteristic(this.hapChar.ConfiguredName);
      this.service4.updateCharacteristic(this.hapChar.ConfiguredName, 'Black Tea/Boil');
      this.service4.addCharacteristic(this.hapChar.ServiceLabelIndex);
      this.service4.updateCharacteristic(this.hapChar.ServiceLabelIndex, 4);
    }

    // Add a switch service for Custom Mode 1
    this.service5 = this.accessory.getService('Custom Mode 1');
    if (deviceConf.showCustomMode1) {
      if (!this.service5) {
        this.service5 = this.accessory.addService(this.hapServ.Switch, 'Custom Mode 1', 'customMode1');
        this.service5.addCharacteristic(this.hapChar.ConfiguredName);
        this.service5.updateCharacteristic(this.hapChar.ConfiguredName, 'Custom Mode 1');
        this.service5.addCharacteristic(this.hapChar.ServiceLabelIndex);
        this.service5.updateCharacteristic(this.hapChar.ServiceLabelIndex, 5);
      }
    } else if (this.service5) {
      this.accessory.removeService(this.service5);
      this.service5 = undefined;
    }

    // Add a switch service for Custom Mode 2
    this.service6 = this.accessory.getService('Custom Mode 2');
    if (deviceConf.showCustomMode2) {
      if (!this.service6) {
        this.service6 = this.accessory.addService(this.hapServ.Switch, 'Custom Mode 2', 'customMode2');
        this.service6.addCharacteristic(this.hapChar.ConfiguredName);
        this.service6.updateCharacteristic(this.hapChar.ConfiguredName, 'Custom Mode 2');
        this.service6.addCharacteristic(this.hapChar.ServiceLabelIndex);
        this.service6.updateCharacteristic(this.hapChar.ServiceLabelIndex, 6);
      }
    } else if (this.service6) {
      this.accessory.removeService(this.service6);
      this.service6 = undefined;
    }

    // Set up handlers for each service
    if (this.service1) {
      this.service1.getCharacteristic(this.hapChar.On)
        .updateValue(false)
        .onSet(async (value) => this.internalStateUpdate(this.service1!, value as boolean, this.codes.greenTea));
    }

    if (this.service2) {
      this.service2.getCharacteristic(this.hapChar.On)
        .updateValue(false)
        .onSet(async (value) => this.internalStateUpdate(this.service2!, value as boolean, this.codes.oolongTea));
    }

    if (this.service3) {
      this.service3.getCharacteristic(this.hapChar.On)
        .updateValue(false)
        .onSet(async (value) => this.internalStateUpdate(this.service3!, value as boolean, this.codes.coffee));
    }

    if (this.service4) {
      this.service4.getCharacteristic(this.hapChar.On)
        .updateValue(false)
        .onSet(async (value) => this.internalStateUpdate(this.service4!, value as boolean, this.codes.blackTea));
    }

    if (this.service5) {
      this.service5.getCharacteristic(this.hapChar.On)
        .updateValue(false)
        .onSet(async (value) => this.internalStateUpdate(this.service5!, value as boolean, this.codes.customMode1));
    }

    if (this.service6) {
      this.service6.getCharacteristic(this.hapChar.On)
        .updateValue(false)
        .onSet(async (value) => this.internalStateUpdate(this.service6!, value as boolean, this.codes.customMode2));
    }

    // Set the main service to the first available
    this._service = this.service1 || this.service4 || this.accessory.addService(this.hapServ.Switch);

    // Output the customised options to the log
    this.logInitOptions({});

    this.initialised = true;
  }

  private async internalStateUpdate(service: Service, value: boolean, b64Code: string): Promise<void> {
    try {
      if (!value) {
        return;
      }

      // Send the request to change the mode
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: b64Code,
      });

      await sleep(1000);

      // Send the request to turn to boiling mode
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: 'MwEBAAAAAAAAAAAAAAAAAAAAADM=',
      });

      this.cacheState = 'on';
      this.accessory.log(`${platformLang.curMode} [${service.displayName}]`);

      // Turn off the switch after 3 seconds
      setTimeout(() => {
        service.updateCharacteristic(this.hapChar.On, false);
      }, 3000);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        service.updateCharacteristic(this.hapChar.On, false);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check for command updates
    (params.commands || []).forEach((command: string) => {
      const hexString = base64ToHex(command);
      const hexParts = hexToTwoItems(hexString);

      if (getTwoItemPosition(hexParts, 1) !== 'aa') {
        return;
      }

      const deviceFunction = `${getTwoItemPosition(hexParts, 2)}${getTwoItemPosition(hexParts, 3)}`;

      switch (deviceFunction) {
      case '0500':
        // Current mode - no action needed for brief state
        break;
      case '1001':
        // Current temperature - could be exposed in future
        break;
      case '1700': {
        // On/off base
        const onBase: 'yes' | 'no' = getTwoItemPosition(hexParts, 4) === '00' ? 'yes' : 'no';
        if (this.cacheOnBase !== onBase) {
          this.cacheOnBase = onBase;
          this.accessory.log(`current on base [${this.cacheOnBase}]`);
        }
        break;
      }
      case '2200':
      case '2201':
      case '2300':
      case '2301':
        // Keep warm / scheduled start - ignore
        break;
      default:
        this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        break;
      }
    });
  }
}

export default KettleDevice;
