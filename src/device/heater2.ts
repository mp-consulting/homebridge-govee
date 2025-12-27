import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import { hs2rgb, rgb2hs } from '../utils/colour.js';
import {
  farToCen,
  generateCodeFromHexValues,
  generateRandomString,
  getTwoItemPosition,
  hasProperty,
  hexToDecimal,
  nearestHalf,
  processCommands,
  sleep,
} from '../utils/functions.js';
import {
  HEATER2_SWING_CODES,
  HEATER2_LOCK_CODES,
  HEATER2_SPEED_CODES,
  HEATER2_SPEED_LABELS,
  HEATER2_TEMP_CODES_AUTO,
  HEATER2_TEMP_CODES_AUTO_TURN,
} from '../catalog/index.js';

/**
 * Heater 2 device handler for H7131/H7132.
 * Uses HeaterCooler service with Fan and Lightbulb (night light) services.
 */
export class Heater2Device extends GoveeDeviceBase {
  private _service!: Service;
  private fanService!: Service;
  private lightService!: Service;

  // Cached values
  private cacheMode = 'auto';
  private cacheTemp = 20;
  private cacheTarg = 20;
  private cacheSpeed = 0;
  private cacheSwing: 'on' | 'off' = 'off';
  private cacheLock: 'on' | 'off' = 'off';
  private cacheFanState: 'on' | 'off' = 'off';
  private cacheLightState: 'on' | 'off' = 'off';
  private cacheBright = 100;
  private cacheHue = 0;
  private cacheSat = 0;

  // Debounce keys
  private updateKeyBright = '';
  private updateKeyColour = '';

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove old Lightbulb service (if exists from v9.4.0 -> v9.4.1 bug)
    this.removeServiceIfExists('Lightbulb');

    // Add the HeaterCooler service
    let heaterService = this.accessory.getService(this.hapServ.HeaterCooler);
    if (!heaterService) {
      heaterService = this.accessory.addService(this.hapServ.HeaterCooler);
      heaterService.updateCharacteristic(this.hapChar.CurrentTemperature, 20);
      heaterService.updateCharacteristic(this.hapChar.HeatingThresholdTemperature, 20);
    }
    this._service = heaterService;

    // Add the Fan service
    this.fanService = this.accessory.getService(this.hapServ.Fan)
      || this.accessory.addService(this.hapServ.Fan);

    // Add the Lightbulb service (night light)
    this.lightService = this.accessory.getService(this.hapServ.Lightbulb)
      || this.accessory.addService(this.hapServ.Lightbulb);

    // Set up HeaterCooler Active characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off';

    // Set up Target Heater Cooler State
    this._service
      .getCharacteristic(this.hapChar.TargetHeaterCoolerState)
      .setProps({
        minValue: 0,
        maxValue: 1,
        validValues: [0, 1],
      })
      .onSet(async (value) => this.internalModeUpdate(value as number));

    this.cacheTemp = this._service.getCharacteristic(this.hapChar.CurrentTemperature).value as number;

    // Set up Heating Threshold Temperature
    this._service
      .getCharacteristic(this.hapChar.HeatingThresholdTemperature)
      .setProps({
        minValue: 5,
        maxValue: 30,
        minStep: 1,
      })
      .onSet(async (value) => this.internalTempUpdate(value as number));
    this.cacheTarg = this._service.getCharacteristic(this.hapChar.HeatingThresholdTemperature).value as number;

    // Set up Swing Mode
    this._service
      .getCharacteristic(this.hapChar.SwingMode)
      .onSet(async (value) => this.internalSwingUpdate(value as number));
    this.cacheSwing = this._service.getCharacteristic(this.hapChar.SwingMode).value === 1 ? 'on' : 'off';

    // Set up Lock Physical Controls
    this._service
      .getCharacteristic(this.hapChar.LockPhysicalControls)
      .onSet(async (value) => this.internalLockUpdate(value as number));
    this.cacheLock = this._service.getCharacteristic(this.hapChar.LockPhysicalControls).value === 1 ? 'on' : 'off';

    // Set up Fan On characteristic
    this.fanService
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalFanStateUpdate(value as boolean));
    this.cacheFanState = this.fanService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Set up Fan Rotation Speed
    this.fanService
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        minStep: 25,
        validValues: [0, 25, 50, 75, 100],
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this.fanService.getCharacteristic(this.hapChar.RotationSpeed).value as number;

    // Obtain the current mode
    this.cacheMode = HEATER2_SPEED_LABELS[this.cacheSpeed];

    // Set up Lightbulb On characteristic
    this.lightService
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => this.internalLightStateUpdate(value as boolean));
    this.cacheLightState = this.lightService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Set up Lightbulb Brightness
    this.lightService
      .getCharacteristic(this.hapChar.Brightness)
      .onSet(async (value) => this.internalBrightnessUpdate(value as number));
    this.cacheBright = this.lightService.getCharacteristic(this.hapChar.Brightness).value as number;

    // Set up Lightbulb Hue
    this.lightService
      .getCharacteristic(this.hapChar.Hue)
      .onSet(async (value) => this.internalColourUpdate(value as number));
    this.cacheHue = this.lightService.getCharacteristic(this.hapChar.Hue).value as number;
    this.cacheSat = this.lightService.getCharacteristic(this.hapChar.Saturation).value as number;

    // Output the customised options to the log
    this.logInitOptions({});

    this.initialised = true;
  }

  private async internalStateUpdate(value: number): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value === 1 ? 'on' : 'off';

      if (this.cacheState === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'stateHeat',
        value: value === 1,
      });

      // If turning off, also show the fan as off
      if (newValue === 'off') {
        this.fanService.updateCharacteristic(this.hapChar.On, false);
      }

      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.Active),
        this.cacheState === 'on' ? 1 : 0,
      );
    }
  }

  private async internalModeUpdate(value: number): Promise<void> {
    try {
      let codeToSend: string;
      let newMode: string;

      if (value === 0) {
        // Auto mode
        codeToSend = HEATER2_TEMP_CODES_AUTO_TURN[this.cacheTarg];
        newMode = 'auto';
      } else {
        // Heat mode
        codeToSend = HEATER2_SPEED_CODES[this.cacheSpeed] || HEATER2_SPEED_CODES[25];
        newMode = HEATER2_SPEED_LABELS[this.cacheSpeed] || HEATER2_SPEED_LABELS[25];
      }

      await this.sendDeviceUpdate({
        cmd: 'multiSync',
        value: codeToSend,
      });

      // If the new mode is auto, turn off the fan
      if (newMode === 'auto') {
        this.fanService.updateCharacteristic(this.hapChar.On, false);
      }

      if (this.cacheMode !== newMode) {
        this.cacheMode = newMode;
        this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
      }
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

      // If not in auto mode, switch to auto mode
      const codeToSend = this.cacheMode === 'auto' ? HEATER2_TEMP_CODES_AUTO[value] : HEATER2_TEMP_CODES_AUTO_TURN[value];

      await this.sendDeviceUpdate({
        cmd: 'multiSync',
        value: codeToSend,
      });

      this.cacheMode = 'auto';
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

  private async internalSwingUpdate(value: number): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value === 1 ? 'on' : 'off';

      if (this.cacheSwing === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'multiSync',
        value: value === 1 ? HEATER2_SWING_CODES.on : HEATER2_SWING_CODES.off,
      });

      this.cacheSwing = newValue;
      this.accessory.log(`${platformLang.curSwing} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.SwingMode),
        this.cacheSwing === 'on' ? 1 : 0,
      );
    }
  }

  private async internalLockUpdate(value: number): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value === 1 ? 'on' : 'off';

      if (this.cacheLock === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'multiSync',
        value: value === 1 ? HEATER2_LOCK_CODES.on : HEATER2_LOCK_CODES.off,
      });

      this.cacheLock = newValue;
      this.accessory.log(`${platformLang.curLock} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.LockPhysicalControls),
        this.cacheLock === 'on' ? 1 : 0,
      );
    }
  }

  private async internalFanStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value ? 'on' : 'off';

      if (this.cacheFanState === newValue) {
        return;
      }

      // Turning fan on
      if (newValue === 'on') {
        if (this.cacheState !== 'on') {
          this.cacheState = 'on';
          this._service.updateCharacteristic(this.hapChar.Active, 1);
          this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
        }
        this.cacheFanState = 'on';
        return;
      }

      // Turning fan off - set to auto mode
      this.cacheFanState = 'off';
      this.cacheMode = 'auto';
      this._service.updateCharacteristic(this.hapChar.TargetHeaterCoolerState, 0);
      this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this.fanService.getCharacteristic(this.hapChar.On),
        this.cacheFanState === 'on',
      );
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      if (this.cacheSpeed === value || value === 0) {
        return;
      }

      const codeToSend = HEATER2_SPEED_CODES[value];

      await this.sendDeviceUpdate({
        cmd: 'multiSync',
        value: codeToSend,
      });

      this.cacheFanState = 'on';
      this._service.updateCharacteristic(this.hapChar.Active, 1);
      this._service.updateCharacteristic(this.hapChar.TargetHeaterCoolerState, 1);

      if (this.cacheSpeed !== value) {
        this.cacheSpeed = value;
        this.cacheMode = HEATER2_SPEED_LABELS[value];
        this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
      }
    } catch (err) {
      this.handleUpdateError(
        err,
        this.fanService.getCharacteristic(this.hapChar.RotationSpeed),
        this.cacheSpeed,
      );
    }
  }

  private async internalLightStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value ? 'on' : 'off';

      if (this.cacheLightState === newValue) {
        return;
      }

      const hexValues = [0x3A, 0x1B, 0x01, 0x01, value ? 0x01 : 0x00];

      await this.sendDeviceUpdate({
        cmd: 'multiSync',
        value: generateCodeFromHexValues(hexValues),
      });

      this.cacheLightState = newValue;
      this.accessory.log(`${platformLang.curLight} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this.lightService.getCharacteristic(this.hapChar.On),
        this.cacheLightState === 'on',
      );
    }
  }

  private async internalBrightnessUpdate(value: number): Promise<void> {
    try {
      // Debounce
      const updateKey = generateRandomString(5);
      this.updateKeyBright = updateKey;
      await sleep(350);
      if (updateKey !== this.updateKeyBright) {
        return;
      }

      if (value === this.cacheBright) {
        return;
      }

      const hexValues = [0x3A, 0x1B, 0x01, 0x02, value];

      await this.sendDeviceUpdate({
        cmd: 'multiSync',
        value: generateCodeFromHexValues(hexValues),
      });

      // Govee considers 0% brightness to be off
      if (value === 0) {
        setTimeout(() => {
          this.cacheLightState = 'off';
          if (this.lightService.getCharacteristic(this.hapChar.On).value) {
            this.lightService.updateCharacteristic(this.hapChar.On, false);
            this.accessory.log(`${platformLang.curLight} [${this.cacheLightState}]`);
          }
          this.lightService.updateCharacteristic(this.hapChar.Brightness, this.cacheBright);
        }, 1500);
        return;
      }

      this.cacheBright = value;
      this.accessory.log(`${platformLang.curBright} [${value}%]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this.lightService.getCharacteristic(this.hapChar.Brightness),
        this.cacheBright,
      );
    }
  }

  private async internalColourUpdate(value: number): Promise<void> {
    try {
      // Debounce
      const updateKey = generateRandomString(5);
      this.updateKeyColour = updateKey;
      await sleep(300);
      if (updateKey !== this.updateKeyColour) {
        return;
      }

      if (value === this.cacheHue) {
        return;
      }

      const newRGB = hs2rgb(value, this.lightService.getCharacteristic(this.hapChar.Saturation).value as number);
      const hexValues = [0x3A, 0x1B, 0x05, 0x0D, ...newRGB];

      await this.sendDeviceUpdate({
        cmd: 'multiSync',
        value: generateCodeFromHexValues(hexValues),
      });

      this.cacheHue = value;
      this.accessory.log(`${platformLang.curColour} [rgb ${newRGB.join(' ')}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this.lightService.getCharacteristic(this.hapChar.Hue),
        this.cacheHue,
      );
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Update the active characteristic
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }

    // Update the current temperature
    if (hasProperty(params, 'temperature')) {
      const newTemp = nearestHalf(farToCen(params.temperature! / 100));
      if (newTemp !== this.cacheTemp) {
        this.cacheTemp = newTemp;
        this._service.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp);
        this.accessory.log(`${platformLang.curTemp} [${this.cacheTemp}°C]`);
      }
    }

    // Update the target temperature
    if (hasProperty(params, 'setTemperature')) {
      const newTemp = Math.round(farToCen(params.setTemperature! / 100));
      if (newTemp !== this.cacheTarg) {
        this.cacheTarg = newTemp;
        this.cacheFanState = 'off';
        this.cacheSpeed = 0;
        this.cacheMode = 'auto';
        this._service.updateCharacteristic(this.hapChar.HeatingThresholdTemperature, this.cacheTarg);
        this.accessory.log(`${platformLang.curTarg} [${this.cacheTarg}°C]`);
      }
    }

    if (params.commands) {
      processCommands(
        params.commands,
        {
          '1b01': (hexParts) => this.handleNightLightUpdate(hexParts),
          '1b05': (hexParts) => this.handleNightLightColourUpdate(hexParts),
          '1f00': (hexParts) => this.handleSwingLockUpdate(hexParts),
          '1f01': (hexParts) => this.handleSwingLockUpdate(hexParts),
          '0509': () => this.handleFanOnlyModeUpdate(),
          '0501': (hexParts) => this.handleSpeedModeUpdate(hexParts),
          '0503': () => this.handleAutoModeUpdate(),
          '1a00': () => {}, // Timer - ignore
          '1100': () => {}, // Timer - ignore
          '1101': () => {}, // Timer - ignore
          '1600': () => {}, // Display mode - ignore
          '1601': () => {}, // Display mode - ignore
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleNightLightUpdate(hexParts: string[]): void {
    const newLightState: 'on' | 'off' = getTwoItemPosition(hexParts, 4) === '01' ? 'on' : 'off';
    if (this.cacheLightState !== newLightState) {
      this.cacheLightState = newLightState;
      this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLightState === 'on');
      this.accessory.log(`${platformLang.curLight} [${this.cacheLightState}]`);
    }
    const newBrightness = hexToDecimal(getTwoItemPosition(hexParts, 5));
    if (this.cacheBright !== newBrightness) {
      this.cacheBright = newBrightness;
      this.lightService.updateCharacteristic(this.hapChar.Brightness, this.cacheBright);
      this.accessory.log(`${platformLang.curBright} [${this.cacheBright}%]`);
    }
  }

  private handleNightLightColourUpdate(hexParts: string[]): void {
    const newR = hexToDecimal(getTwoItemPosition(hexParts, 5));
    const newG = hexToDecimal(getTwoItemPosition(hexParts, 6));
    const newB = hexToDecimal(getTwoItemPosition(hexParts, 7));

    const hs = rgb2hs(newR, newG, newB);

    if (hs[0] !== this.cacheHue) {
      this.lightService.updateCharacteristic(this.hapChar.Hue, hs[0]);
      this.lightService.updateCharacteristic(this.hapChar.Saturation, hs[1]);
      this.cacheHue = hs[0];
      this.accessory.log(`${platformLang.curColour} [rgb ${newR} ${newG} ${newB}]`);
    }
  }

  private handleSwingLockUpdate(hexParts: string[]): void {
    const newSwing: 'on' | 'off' = getTwoItemPosition(hexParts, 3) === '01' ? 'on' : 'off';
    if (this.cacheSwing !== newSwing) {
      this.cacheSwing = newSwing;
      this._service.updateCharacteristic(this.hapChar.SwingMode, this.cacheSwing === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curSwing} [${this.cacheSwing}]`);
    }

    const newLock: 'on' | 'off' = getTwoItemPosition(hexParts, 4) === '01' ? 'on' : 'off';
    if (this.cacheLock !== newLock) {
      this.cacheLock = newLock;
      this._service.updateCharacteristic(this.hapChar.LockPhysicalControls, this.cacheLock === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curLock} [${this.cacheLock}]`);
    }
  }

  private handleFanOnlyModeUpdate(): void {
    if (this.cacheMode !== 'fan-only') {
      this.cacheMode = 'fan-only';
      this.cacheFanState = 'on';
      this.cacheSpeed = 25;
      this.fanService.updateCharacteristic(this.hapChar.On, true);
      this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, 25);
      this._service.updateCharacteristic(this.hapChar.TargetHeaterCoolerState, 1);
      this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
    }
  }

  private handleSpeedModeUpdate(hexParts: string[]): void {
    const newMode = getTwoItemPosition(hexParts, 4);
    switch (newMode) {
    case '01': {
      if (this.cacheMode !== 'low') {
        this.cacheMode = 'low';
        this.cacheFanState = 'on';
        this.cacheSpeed = 50;
        this.fanService.updateCharacteristic(this.hapChar.On, true);
        this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, 50);
        this._service.updateCharacteristic(this.hapChar.TargetHeaterCoolerState, 1);
        this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
      }
      break;
    }
    case '02': {
      if (this.cacheMode !== 'medium') {
        this.cacheMode = 'medium';
        this.cacheFanState = 'on';
        this.cacheSpeed = 75;
        this.fanService.updateCharacteristic(this.hapChar.On, true);
        this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, 75);
        this._service.updateCharacteristic(this.hapChar.TargetHeaterCoolerState, 1);
        this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
      }
      break;
    }
    case '03': {
      if (this.cacheMode !== 'high') {
        this.cacheMode = 'high';
        this.cacheFanState = 'on';
        this.cacheSpeed = 100;
        this.fanService.updateCharacteristic(this.hapChar.On, true);
        this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, 100);
        this._service.updateCharacteristic(this.hapChar.TargetHeaterCoolerState, 1);
        this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
      }
      break;
    }
    default:
      break;
    }
  }

  private handleAutoModeUpdate(): void {
    if (this.cacheMode !== 'auto') {
      this.cacheMode = 'auto';
      this.cacheFanState = 'off';
      this.cacheSpeed = 0;
      this.fanService.updateCharacteristic(this.hapChar.On, false);
      this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, 0);
      this._service.updateCharacteristic(this.hapChar.TargetHeaterCoolerState, 0);
      this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
    }
  }
}

export default Heater2Device;
