import type { Service } from 'homebridge';
import type { ExternalUpdateParams } from '../types.js';
import { platformLang } from '../utils/index.js';
import {
  farToCen,
  getTwoItemPosition,
  hasProperty,
  nearestHalf,
  type CommandHandlerFn,
} from '../utils/functions.js';
import {
  HEATER_H7130_TEMP_CODES_AUTO,
  HEATER_H7130_TEMP_CODES_HEAT,
  HEATER_TEMP_MIN,
  HEATER_TEMP_MAX,
} from '../catalog/index.js';
import { Heater1aDevice, TEMP_THRESHOLD } from './heater1a.js';

const DEFAULT_TEMP = 20;

/**
 * Heater 1B device handler for H7130 (with temperature reporting).
 * Uses a HeaterCooler service (power, mode, target temperature, swing, lock) with a
 * separate Fan service for the speed, which is otherwise the same as Heater1aDevice.
 */
export class Heater1bDevice extends Heater1aDevice {
  private fanService!: Service;

  // Cached values
  private cacheMode: 'auto' | 'heat' = 'auto';
  private cacheTemp = DEFAULT_TEMP;
  private cacheTarg = DEFAULT_TEMP;
  private cacheFanState: 'on' | 'off' = 'off';

  protected override get speedService(): Service {
    return this.fanService;
  }

  override init(): void {
    // Remove old services
    this.removeServiceIfExists('Lightbulb');
    this.removeServiceIfExists('Fanv2');

    // Add the HeaterCooler service
    let heaterService = this.accessory.getService(this.hapServ.HeaterCooler);
    if (!heaterService) {
      heaterService = this.accessory.addService(this.hapServ.HeaterCooler);
      heaterService.updateCharacteristic(this.hapChar.CurrentTemperature, DEFAULT_TEMP);
      heaterService.updateCharacteristic(this.hapChar.HeatingThresholdTemperature, DEFAULT_TEMP);
    }
    this._service = heaterService;

    // Add the Fan service
    this.fanService = this.accessory.getService(this.hapServ.Fan)
      || this.accessory.addService(this.hapServ.Fan);

    this.setupPowerSwingAndLock();

    // Set up Target Heater Cooler State
    this._service
      .getCharacteristic(this.hapChar.TargetHeaterCoolerState)
      .setProps({
        minValue: 0,
        maxValue: 1,
        validValues: [0, 1],
      })
      .onSet(async (value) => this.internalModeUpdate(value as number));
    this.cacheMode = this._service.getCharacteristic(this.hapChar.TargetHeaterCoolerState).value === 0 ? 'auto' : 'heat';

    this.cacheTemp = this._service.getCharacteristic(this.hapChar.CurrentTemperature).value as number;

    // Set up Heating Threshold Temperature
    this._service
      .getCharacteristic(this.hapChar.HeatingThresholdTemperature)
      .setProps({
        minValue: HEATER_TEMP_MIN,
        maxValue: HEATER_TEMP_MAX,
        minStep: 1,
      })
      .onSet(async (value) => this.internalTempUpdate(value as number));
    this.cacheTarg = this._service.getCharacteristic(this.hapChar.HeatingThresholdTemperature).value as number;

    // Set up Fan On characteristic
    this.fanService
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalFanStateUpdate(value as boolean));
    this.cacheFanState = this.fanService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    this.setupSpeed();

    // Output the customised options to the log
    this.logInitOptions({ tempReporting: true });

    this.initialised = true;
  }

  /** The fan tile mirrors the heater's power state */
  protected override onStateChange(state: 'on' | 'off'): void {
    if (this.cacheFanState !== state) {
      this.cacheFanState = state;
      this.fanService.updateCharacteristic(this.hapChar.On, state === 'on');
    }
  }

  private async internalModeUpdate(value: number): Promise<void> {
    try {
      const newMode: 'auto' | 'heat' = value === 0 ? 'auto' : 'heat';

      if (this.cacheMode === newMode) {
        return;
      }

      const objectToChoose = newMode === 'auto' ? HEATER_H7130_TEMP_CODES_AUTO : HEATER_H7130_TEMP_CODES_HEAT;

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: objectToChoose[this.cacheTarg],
      });

      this.cacheMode = newMode;
      this.accessory.log(`${platformLang.curMode} [${newMode}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.TargetHeaterCoolerState),
        this.cacheMode === 'auto' ? 0 : 1,
      );
    }
  }

  private async internalTempUpdate(value: number): Promise<void> {
    try {
      if (this.cacheTarg === value) {
        return;
      }

      const objectToChoose = this.cacheMode === 'auto' ? HEATER_H7130_TEMP_CODES_AUTO : HEATER_H7130_TEMP_CODES_HEAT;

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: objectToChoose[value],
      });

      this.cacheTarg = value;
      this.accessory.log(`${platformLang.curTarg} [${this.cacheTarg}°C]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.HeatingThresholdTemperature),
        this.cacheTarg,
      );
    }
  }

  private async internalFanStateUpdate(value: boolean): Promise<void> {
    const newValue: 'on' | 'off' = value ? 'on' : 'off';

    if (this.cacheFanState === newValue) {
      return;
    }

    // The fan only runs with the heater, so a manual toggle is reverted
    if (newValue === 'on') {
      this.schedule(() => {
        this.fanService.updateCharacteristic(this.hapChar.On, false);
      }, 3000);
      return;
    }

    this.schedule(() => {
      this.fanService.updateCharacteristic(this.hapChar.On, true);
      this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
    }, 2000);
  }

  protected override handleTemperatures(params: ExternalUpdateParams): void {
    // Update the current temperature
    if (hasProperty(params, 'temperature')) {
      const newTemp = nearestHalf(farToCen(params.temperature! / TEMP_THRESHOLD));
      if (newTemp !== this.cacheTemp) {
        if (newTemp > TEMP_THRESHOLD) {
          this.accessory.logWarn('you should disable `tempReporting` in the config for this device');
        } else {
          this.cacheTemp = newTemp;
          this._service.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp);
          this.accessory.log(`${platformLang.curTemp} [${this.cacheTemp}°C]`);
        }
      }
    }

    // Update the target temperature
    if (hasProperty(params, 'setTemperature')) {
      const newTemp = Math.round(farToCen(params.setTemperature! / TEMP_THRESHOLD));
      if (newTemp !== this.cacheTarg) {
        this.cacheTarg = newTemp;
        this._service.updateCharacteristic(this.hapChar.HeatingThresholdTemperature, this.cacheTarg);
        this.accessory.log(`${platformLang.curTarg} [${this.cacheTarg}°C]`);
      }
    }
  }

  protected override commandHandlers(): Record<string, CommandHandlerFn> {
    return {
      ...super.commandHandlers(),
      '1a00': (hexParts) => this.handleModeExternalUpdate(hexParts),
      '1a01': (hexParts) => this.handleModeExternalUpdate(hexParts),
      '1100': () => {}, // Timer - ignore
      '1101': () => {}, // Timer - ignore
      '1300': () => {}, // Scheduling - ignore
      '1600': () => {}, // DND - ignore
      '1601': () => {}, // DND - ignore
    };
  }

  protected override handleSpeedExternalUpdate(hexParts: string[]): void {
    // A speed report while the heater runs means the fan is running too
    if (this.cacheState === 'on' && this.cacheFanState !== 'on') {
      this.cacheFanState = 'on';
      this.fanService.updateCharacteristic(this.hapChar.On, true);
      this.accessory.log(`${platformLang.curMode} [${this.cacheFanState}]`);
    }
    super.handleSpeedExternalUpdate(hexParts);
  }

  private handleModeExternalUpdate(hexParts: string[]): void {
    const newMode: 'auto' | 'heat' = getTwoItemPosition(hexParts, 3) === '01' ? 'auto' : 'heat';
    if (this.cacheMode !== newMode) {
      this.cacheMode = newMode;
      this._service.updateCharacteristic(this.hapChar.TargetHeaterCoolerState, this.cacheMode === 'auto' ? 0 : 1);
      this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
    }
  }
}

