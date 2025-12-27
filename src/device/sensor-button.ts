import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';

/**
 * Button sensor device handler.
 * Currently only logs scene changes (no HomeKit service exposed).
 */
export class SensorButtonDevice extends GoveeDeviceBase {
  private _service!: Service;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Button sensors don't have a direct HomeKit equivalent
    // They typically trigger scenes/automations
    this._service = this.accessory.getService(this.hapServ.StatelessProgrammableSwitch)
      || this.accessory.addService(this.hapServ.StatelessProgrammableSwitch);

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

export default SensorButtonDevice;
