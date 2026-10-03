import type { Characteristic, Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  getTwoItemPosition,
  hexToBase64,
  processCommands,
  statusToActionCode,
} from '../utils/functions.js';
import {
  PURIFIER_H7122_SPEED_CODES,
  PURIFIER_SPEED_COMMAND_MAP,
  LOCK_CODES,
  DISPLAY_CODES,
} from '../catalog/index.js';

// H7122 and H7123 share speed codes
const SPEED_VALUE_CODES = PURIFIER_H7122_SPEED_CODES;

const SPEED_VALUE_LABELS: Record<number, string> = {
  0: 'off',
  1: 'sleep',
  2: 'low',
  3: 'medium',
  4: 'high',
  5: 'auto',
};

// Speed mode increment for rotation speed
const SPEED_STEP = 20;
// Custom speed code that indicates non-standard mode
const CUSTOM_SPEED_CODE = '0202';

/**
 * Shared handler for the 5-speed purifiers with an air quality sensor (H7122, H7123/H7124):
 * on/off, speed, lock and display light. Subclasses define how air quality is exposed and
 * which status opcode reports it.
 */
export abstract class PurifierAirQualityBase extends GoveeDeviceBase {
  protected _service!: Service;
  protected airService!: Service;

  // Cached values
  private cacheMode = 1;
  private cacheLock: 'on' | 'off' = 'off';
  private cacheDisplay: 'on' | 'off' = 'off';

  /** Status opcode (byte after `aa`) that carries the air quality reading */
  protected abstract readonly airQualityOpcode: string;

  /** Add or remove the air quality characteristics this model supports */
  protected abstract setupAirQuality(): void;

  /** Apply an air quality status frame */
  protected abstract handleAirQualityUpdate(hexParts: string[]): void;

  // Custom characteristic for display light
  private displayLightChar?: Characteristic;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Add the purifier service
    this._service = this.getOrAddService(this.hapServ.AirPurifier);

    // Add the air quality service
    this.airService = this.getOrAddService(this.hapServ.AirQualitySensor);

    this.setupAirQuality();

    // Active characteristic
    this._service.getCharacteristic(this.hapChar.Active).onSet(async (value) => {
      await this.internalStateUpdate(value as number);
    });
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off';

    // Target state (manual only)
    this._service
      .getCharacteristic(this.hapChar.TargetAirPurifierState)
      .updateValue(1)
      .setProps({ minValue: 1, maxValue: 1, validValues: [1] });

    // Rotation speed (5 modes at 20% increments)
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({ minStep: SPEED_STEP, validValues: [0, 20, 40, 60, 80, 100] })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheMode = Math.floor((this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number || SPEED_STEP) / SPEED_STEP);

    // Lock controls
    this._service.getCharacteristic(this.hapChar.LockPhysicalControls).onSet(async (value) => {
      await this.internalLockUpdate(value as number);
    });
    this.cacheLock = this._service.getCharacteristic(this.hapChar.LockPhysicalControls).value === 1 ? 'on' : 'off';

    // Display light custom characteristic
    this.displayLightChar = this.addCustomCharacteristic(
      this._service,
      this.platform.cusChar.DisplayLight,
      async (value: boolean) => this.internalDisplayLightUpdate(value),
    );
    if (this.displayLightChar) {
      this.cacheDisplay = this.displayLightChar.value ? 'on' : 'off';
    }

    this.logInitOptions({});
    this.initialised = true;
  }

  private async internalStateUpdate(value: number): Promise<void> {
    try {
      const newValue = value === 1 ? 'on' : 'off';
      if (this.cacheState === newValue) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'statePuri', value: value ? 1 : 0 });

      this._service.updateCharacteristic(this.hapChar.CurrentAirPurifierState, value === 1 ? 2 : 0);
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

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      if (value === 0) {
        return;
      }

      // Get the mode key {1, 2, 3, 4, 5}
      const newValueKey = Math.floor(value / SPEED_STEP);
      if (!newValueKey || newValueKey === this.cacheMode) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: SPEED_VALUE_CODES[newValueKey] });

      this.cacheMode = newValueKey;
      this.accessory.log(`${platformLang.curMode} [${SPEED_VALUE_LABELS[this.cacheMode]}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.RotationSpeed),
        this.cacheMode * SPEED_STEP,
      );
    }
  }

  private async internalLockUpdate(value: number): Promise<void> {
    try {
      const newValue = value === 1 ? 'on' : 'off';
      if (this.cacheLock === newValue) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: LOCK_CODES[newValue] });

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

  private async internalDisplayLightUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';
      if (this.cacheDisplay === newValue) {
        return;
      }

      // Generate the code to send - use cached display code if available
      let codeToSend: string;
      if (value) {
        const cachedDisplayCode = this.accessory.context.cacheDisplayCode as string | undefined;
        codeToSend = cachedDisplayCode
          ? hexToBase64(statusToActionCode(cachedDisplayCode))
          : DISPLAY_CODES.on;
      } else {
        codeToSend = DISPLAY_CODES.off;
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: codeToSend });

      this.cacheDisplay = newValue;
      this.accessory.log(`${platformLang.curDisplay} [${newValue}]`);
    } catch (err) {
      if (this.displayLightChar) {
        this.handleUpdateError(err, this.displayLightChar, this.cacheDisplay === 'on');
      }
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      this._service.updateCharacteristic(this.hapChar.CurrentAirPurifierState, this.cacheState === 'on' ? 2 : 0);
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }

    if (params.commands) {
      processCommands(
        params.commands,
        {
          // Keyed by opcode alone: these handlers read the sub-code bytes themselves
          '05': (hexParts) => this.handleSpeedUpdate(hexParts),
          '10': (hexParts) => this.handleLockUpdate(hexParts),
          '16': (hexParts, hexString) => this.handleDisplayUpdate(hexParts, hexString),
          [this.airQualityOpcode]: (hexParts) => this.handleAirQualityUpdate(hexParts),
          // Ignored commands
          '11': () => {}, // timer
          '13': () => {}, // scheduling
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleSpeedUpdate(hexParts: string[]): void {
    const newSpeedCode = `${getTwoItemPosition(hexParts, 3)}${getTwoItemPosition(hexParts, 4)}`;

    // Different behaviour for custom speed
    if (newSpeedCode === CUSTOM_SPEED_CODE) {
      this.accessory.log(`${platformLang.curMode} [custom]`);
      return;
    }

    const newMode = PURIFIER_SPEED_COMMAND_MAP[newSpeedCode];
    if (newMode && newMode !== this.cacheMode) {
      this.cacheMode = newMode;
      this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheMode * SPEED_STEP);
      this.accessory.log(`${platformLang.curMode} [${SPEED_VALUE_LABELS[this.cacheMode]}]`);
    }
  }

  private handleLockUpdate(hexParts: string[]): void {
    const newLock = getTwoItemPosition(hexParts, 3) === '01' ? 'on' : 'off';
    if (newLock !== this.cacheLock) {
      this.cacheLock = newLock;
      this._service.updateCharacteristic(this.hapChar.LockPhysicalControls, this.cacheLock === 'on' ? 1 : 0);
      this.accessory.log(`${platformLang.curLock} [${this.cacheLock}]`);
    }
  }

  private handleDisplayUpdate(hexParts: string[], hexString: string): void {
    const newDisplay = getTwoItemPosition(hexParts, 3) === '01' ? 'on' : 'off';
    if (newDisplay === 'on') {
      this.accessory.context.cacheDisplayCode = hexString;
    }
    if (newDisplay !== this.cacheDisplay) {
      this.cacheDisplay = newDisplay;
      if (this.displayLightChar) {
        this.displayLightChar.updateValue(this.cacheDisplay === 'on');
      }
      this.accessory.log(`${platformLang.curDisplay} [${this.cacheDisplay}]`);
    }
  }
}

