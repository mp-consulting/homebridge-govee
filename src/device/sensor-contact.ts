import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';

/**
 * Contact sensor device handler.
 * Currently only logs scene changes (contact state not yet implemented).
 */
export class SensorContactDevice extends GoveeDeviceBase {
  private _service!: Service;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Add ContactSensor service
    this._service = this.accessory.getService(this.hapServ.ContactSensor)
      || this.accessory.addService(this.hapServ.ContactSensor);

    // Output the customised options to the log
    this.logInitOptions({});

    this.initialised = true;
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Log any scene changes
    if (params.scene) {
      this.accessory.logWarn(`${platformLang.newScene}: [${params.scene}]`);
    }
  }
}

export default SensorContactDevice;
