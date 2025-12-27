import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  base64ToHex,
  generateRandomString,
  getTwoItemPosition,
  hexToTwoItems,
} from '../utils/functions.js';

/**
 * Single outlet device handler.
 * Supports on/off control and power monitoring for H5086 model.
 */
export class OutletSingleDevice extends GoveeDeviceBase {
  private _service!: Service;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private eveChar: any;

  // Power monitoring cache (for H5086)
  private cacheWatt = 0;
  private cacheAmp = 0;
  private cacheVolt = 0;

  // Debounce timeout
  private updateTimeout: string | false = false;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
    this.eveChar = platform.eveChar;
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove any old services from simulations
    const servicesToRemove = ['AirPurifier', 'HeaterCooler', 'Lightbulb', 'Switch', 'Valve'] as const;
    for (const serviceName of servicesToRemove) {
      this.removeServiceIfExists(serviceName);
    }

    // Add the outlet service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.Outlet)
      || this.accessory.addService(this.hapServ.Outlet);

    // Add the set handler to the switch on/off characteristic
    this._service.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalStateUpdate(value as boolean);
    });
    this.cacheState = this._service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Add power monitoring characteristics for H5086
    if (this.deviceModel === 'H5086') {
      this.setupPowerMonitoring();
    } else {
      // Pass the accessory to Fakegato to set up with Eve
      this.accessory.eveService = new this.platform.eveService('switch', this.accessory, {
        log: () => {},
      }) as unknown as import('../types.js').EveHistoryService;
    }

    // Output the customised options to the log
    this.logInitOptions({
      showAs: 'outlet',
    });

    this.initialised = true;
  }

  private setupPowerMonitoring(): void {
    const EveCurrentConsumption = this.eveChar.CurrentConsumption as typeof import('homebridge').Characteristic;
    const EveElectricCurrent = this.eveChar.ElectricCurrent as typeof import('homebridge').Characteristic;
    const EveVoltage = this.eveChar.Voltage as typeof import('homebridge').Characteristic;

    // Power readings
    if (!this._service.testCharacteristic(EveCurrentConsumption)) {
      this._service.addCharacteristic(EveCurrentConsumption);
    }
    if (!this._service.testCharacteristic(EveElectricCurrent)) {
      this._service.addCharacteristic(EveElectricCurrent);
    }
    if (!this._service.testCharacteristic(EveVoltage)) {
      this._service.addCharacteristic(EveVoltage);
    }

    this.cacheWatt = (this._service.getCharacteristic(EveCurrentConsumption).value as number) || 0;
    this.cacheAmp = (this._service.getCharacteristic(EveElectricCurrent).value as number) || 0;
    this.cacheVolt = (this._service.getCharacteristic(EveVoltage).value as number) || 0;

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('energy', this.accessory, {
      log: () => {},
    }) as unknown as import('../types.js').EveHistoryService;
  }

  private async internalStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      // Don't continue if the new value is the same as before
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

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'stateOutlet',
        value: newValue,
      });

      // Cache the new state and log if appropriate
      if (this.cacheState !== newValue) {
        this.cacheState = newValue;
        this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
      }

      // Add the entry to the Eve history service
      if (this.accessory.eveService) {
        this.accessory.eveService.addEntry({ status: value ? 1 : 0 });
      }
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.On),
        this.cacheState === 'on'
      );
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check to see if the provided state is different from the cached state
    if (params.state && params.state !== this.cacheState) {
      // State is different so update Homebridge with new values
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');

      // Log the change
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);

      // Add the entry to the Eve history service
      if (this.accessory.eveService) {
        this.accessory.eveService.addEntry({
          status: this.cacheState === 'on' ? 1 : 0,
        });
      }
    }

    // Check for some other scene/mode change
    if (params.commands) {
      this.handleCommandUpdates(params.commands);
    }
  }

  private handleCommandUpdates(commands: string[]): void {
    for (const command of commands) {
      const hexString = base64ToHex(command);
      const hexParts = hexToTwoItems(hexString);

      // Return now if not a device query update code
      if (getTwoItemPosition(hexParts, 1) !== 'aa') {
        continue;
      }

      const deviceFunction = `${getTwoItemPosition(hexParts, 1)}${getTwoItemPosition(hexParts, 2)}`;

      switch (deviceFunction) {
        case 'aa19': {
          // Power readings
          this.handlePowerReadings(hexParts);
          break;
        }
        default:
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
          break;
      }
    }
  }

  private handlePowerReadings(hexParts: string[]): void {
    if (this.deviceModel !== 'H5086') {
      return;
    }

    const EveCurrentConsumption = this.eveChar.CurrentConsumption as typeof import('homebridge').Characteristic;
    const EveElectricCurrent = this.eveChar.ElectricCurrent as typeof import('homebridge').Characteristic;
    const EveVoltage = this.eveChar.Voltage as typeof import('homebridge').Characteristic;

    const hexWatt = `${getTwoItemPosition(hexParts, 13)}${getTwoItemPosition(hexParts, 14)}${getTwoItemPosition(hexParts, 15)}`;
    const hexAmp = `${getTwoItemPosition(hexParts, 11)}${getTwoItemPosition(hexParts, 12)}`;
    const hexVolt = `${getTwoItemPosition(hexParts, 9)}${getTwoItemPosition(hexParts, 10)}`;
    const newWatt = Number.parseInt(hexWatt, 16) / 100;
    const newAmp = Number.parseInt(hexAmp, 16) / 100;
    const newVolt = Number.parseInt(hexVolt, 16) / 100;

    if (this.cacheWatt !== newWatt) {
      this.cacheWatt = newWatt;
      this._service.updateCharacteristic(EveCurrentConsumption, this.cacheWatt);
      if (this.accessory.eveService) {
        this.accessory.eveService.addEntry({ power: newWatt });
      }
      this.accessory.log(`${platformLang.curWatt} [${this.cacheWatt}W]`);
    }
    if (this.cacheAmp !== newAmp) {
      this.cacheAmp = newAmp;
      this._service.updateCharacteristic(EveElectricCurrent, this.cacheAmp);
      this.accessory.log(`${platformLang.curAmp} [${this.cacheAmp}A]`);
    }
    if (this.cacheVolt !== newVolt) {
      this.cacheVolt = newVolt;
      this._service.updateCharacteristic(EveVoltage, this.cacheVolt);
      this.accessory.log(`${platformLang.curVolt} [${this.cacheVolt}V]`);
    }
  }
}

export default OutletSingleDevice;
