import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams, EveHistoryService } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { generateRandomString, hasProperty, parseError } from '../utils/functions.js';

/**
 * Cooler device handler (single outlet-based cooler).
 * Uses temperature from a linked sensor to control on/off state.
 * Opposite logic from heater: cools when temperature is ABOVE target.
 */
export class CoolerSingleDevice extends GoveeDeviceBase {
  private _service!: Service;

  // Configuration
  private readonly temperatureSource: string;

  // Cached values
  private cacheTemp = 20;
  private cacheCool: 'on' | 'off' = 'off';

  // Polling
  private initTimeout?: ReturnType<typeof setTimeout>;
  private intervalPoll?: ReturnType<typeof setInterval>;

  // Update timeout
  private updateTimeout: string | false = false;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
    this.temperatureSource = accessory.context.temperatureSource ?? '';
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove any old services from simulations
    const servicesToRemove = ['AirPurifier', 'Lightbulb', 'Outlet', 'Switch', 'Valve'] as const;
    for (const serviceName of servicesToRemove) {
      this.removeServiceIfExists(serviceName);
    }

    // Set up the accessory with default target temp when added the first time
    if (!hasProperty(this.accessory.context, 'cacheTarget')) {
      this.accessory.context.cacheTarget = 20;
    }

    // Check to make sure user has not switched from heater to cooler
    if (this.accessory.context.cacheType !== 'cooler') {
      // Remove and re-setup as a HeaterCooler
      this.removeServiceIfExists('HeaterCooler');
      this.accessory.context.cacheType = 'cooler';
      this.accessory.context.cacheTarget = 20;
    }

    // Add the HeaterCooler service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.HeaterCooler)
      || this.accessory.addService(this.hapServ.HeaterCooler);

    // Set custom properties of the current temperature characteristic
    this._service.getCharacteristic(this.hapChar.CurrentTemperature).setProps({
      minStep: 0.1,
    });
    this.cacheTemp = this._service.getCharacteristic(this.hapChar.CurrentTemperature).value as number;

    // Add the set handler to the active characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));

    // Add options to the target state characteristic (cooling only)
    this._service.getCharacteristic(this.hapChar.TargetHeaterCoolerState).setProps({
      minValue: 0,
      maxValue: 0,
      validValues: [0],
    });

    // Add the set handler to the cooling threshold temperature characteristic
    this._service
      .getCharacteristic(this.hapChar.CoolingThresholdTemperature)
      .updateValue(this.accessory.context.cacheTarget ?? 20)
      .setProps({ minStep: 0.5 })
      .onSet(async (value) => this.internalTargetTempUpdate(value as number));

    // Initialise these caches now since they aren't determined by the initial externalUpdate()
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off';
    this.cacheCool = this.cacheState === 'on' &&
      this._service.getCharacteristic(this.hapChar.CurrentHeaterCoolerState).value === 3
      ? 'on'
      : 'off';

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('custom', this.accessory, {
      log: () => {},
    }) as unknown as EveHistoryService;

    // Set up an interval to get regular temperature updates
    this.initTimeout = setTimeout(() => {
      this.initTimeout = undefined;
      this.getTemperature();
      this.intervalPoll = setInterval(() => this.getTemperature(), 120000);
    }, 5000);

    // Output the customised options to the log
    this.logInitOptions({
      showAs: 'cooler',
      temperatureSource: this.temperatureSource,
    });

    this.initialised = true;
  }

  private async internalStateUpdate(value: number): Promise<void> {
    try {
      let newState: 'on' | 'off';
      let newCool: 'on' | 'off';
      let newValue: 'on' | 'off';

      if (value === 0) {
        newValue = 'off';
        newState = 'off';
        newCool = 'off';
      } else if (this.cacheTemp > (this.accessory.context.cacheTarget ?? 20)) {
        // Cooler logic: turn on when temp is ABOVE target
        newValue = 'on';
        newState = 'on';
        newCool = 'on';
      } else {
        newValue = 'off';
        newState = 'on';
        newCool = 'off';
      }

      // Only send the update if either:
      // * The new value (state) is OFF and the cacheCool was ON
      // * The new value (state) is ON and newCool is 'on'
      if ((value === 0 && this.cacheCool === 'on') || (value === 1 && newCool === 'on')) {
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
      }

      // Cache and log
      if (newState !== this.cacheState) {
        this.cacheState = newState;
        this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
      }
      if (newCool !== this.cacheCool) {
        this.cacheCool = newCool;
        this.accessory.log(`${platformLang.curCool} [${this.cacheCool}]`);
      }
      const newOnState = this.cacheCool === 'on' ? 3 : 1;
      this._service.updateCharacteristic(
        this.hapChar.CurrentHeaterCoolerState,
        value === 1 ? newOnState : 0,
      );
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.Active),
        this.cacheState === 'on' ? 1 : 0,
      );
    }
  }

  private async internalTargetTempUpdate(value: number): Promise<void> {
    try {
      // Don't continue if the new value is the same as before
      if (value === this.accessory.context.cacheTarget) {
        return;
      }
      this.accessory.context.cacheTarget = value;
      this.accessory.log(`${platformLang.curTarg} [${value}°C]`);
      if (this.cacheState === 'off') {
        return;
      }

      // Check to see if we need to turn on or off
      let newValue: 'on' | 'off';
      let newCool: 'on' | 'off';
      if (this.cacheTemp > value) {
        newValue = 'on';
        newCool = 'on';
      } else {
        newValue = 'off';
        newCool = 'off';
      }

      // Don't continue if no change needed to device state
      if (newCool === this.cacheCool) {
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

      // Cache and log
      this.cacheCool = newCool;
      this.accessory.log(`${platformLang.curCool} [${this.cacheCool}]`);
      this._service.updateCharacteristic(
        this.hapChar.CurrentHeaterCoolerState,
        this.cacheCool === 'on' ? 3 : 1,
      );
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.CoolingThresholdTemperature),
        this.accessory.context.cacheTarget ?? 20,
      );
    }
  }

  private async internalCurrentTempUpdate(): Promise<void> {
    try {
      // Don't continue if the device is off
      if (this.cacheState === 'off') {
        return;
      }

      // Check to see if we need to turn on or off
      let newValue: 'on' | 'off';
      let newCool: 'on' | 'off';
      if (this.cacheTemp > (this.accessory.context.cacheTarget ?? 20)) {
        newValue = 'on';
        newCool = 'on';
      } else {
        newValue = 'off';
        newCool = 'off';
      }

      // Don't continue if no change needed to device state
      if (newCool === this.cacheCool) {
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

      // Log and cache
      this.cacheCool = newCool;
      this.accessory.log(`${platformLang.curCool} [${this.cacheCool}]`);
      this._service.updateCharacteristic(
        this.hapChar.CurrentHeaterCoolerState,
        this.cacheCool === 'on' ? 3 : 1,
      );
    } catch (err) {
      this.accessory.logWarn(parseError(err));
    }
  }

  private async getTemperature(): Promise<void> {
    try {
      // Skip polling if the storage hasn't initialised properly
      if (!this.platform.storageClientData) {
        return;
      }

      const newTemp = await this.platform.storageData.getItem(`${this.temperatureSource}_temp`);
      if (newTemp && newTemp !== this.cacheTemp) {
        this.cacheTemp = newTemp as number;
        this._service.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp);
        if (this.accessory.eveService) {
          this.accessory.eveService.addEntry({ temp: this.cacheTemp });
        }
        this.accessory.log(`${platformLang.curTemp} [${this.cacheTemp}°C]`);
        await this.internalCurrentTempUpdate();
      }
    } catch (err) {
      this.accessory.logWarn(parseError(err));
    }
  }

  externalUpdate(_params: ExternalUpdateParams): void {
    // This device type doesn't receive external updates for state
    // State is controlled by temperature threshold logic
  }

  override destroy(): void {
    if (this.initTimeout) {
      clearTimeout(this.initTimeout);
      this.initTimeout = undefined;
    }
    if (this.intervalPoll) {
      clearInterval(this.intervalPoll);
      this.intervalPoll = undefined;
    }
  }
}

export default CoolerSingleDevice;
