import type { Characteristic, Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  getTwoItemPosition,
  hexToBase64,
  hexToDecimal,
  processCommands,
  statusToActionCode,
} from '../utils/functions.js';
import {
  PURIFIER_H7122_SPEED_CODES,
  LOCK_CODES,
  DISPLAY_CODES,
} from '../catalog/index.js';

// Use catalog codes
const SPEED_VALUE_CODES = PURIFIER_H7122_SPEED_CODES;

const SPEED_VALUE_LABELS: Record<number, string> = {
  0: 'off',
  1: 'sleep',
  2: 'low',
  3: 'medium',
  4: 'high',
  5: 'auto',
};

/**
 * Purifier device handler for H7122 model.
 * Supports on/off, 5-speed control, lock, display light, and PM2.5 air quality sensor.
 */
export class PurifierH7122Device extends GoveeDeviceBase {
  private _service!: Service;
  private airService!: Service;

  // Cached values
  private cacheMode = 1;
  private cacheLock: 'on' | 'off' = 'off';
  private cacheDisplay: 'on' | 'off' = 'off';
  private cacheAir = 0;
  private cacheAirQual = '';

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

    // Add PM2.5 Density characteristic
    this.addCharacteristicIfMissing(this.airService, this.hapChar.PM2_5Density);
    this.cacheAir = this.airService.getCharacteristic(this.hapChar.PM2_5Density).value as number;

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
      .setProps({ minStep: 20, validValues: [0, 20, 40, 60, 80, 100] })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheMode = (this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number) / 20 || 1;

    // Lock controls
    this._service.getCharacteristic(this.hapChar.LockPhysicalControls).onSet(async (value) => {
      await this.internalLockUpdate(value as number);
    });
    this.cacheLock = this._service.getCharacteristic(this.hapChar.LockPhysicalControls).value === 1 ? 'on' : 'off';

    // Display light custom characteristic
    this.displayLightChar = this.addCustomCharacteristic(
      this._service,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.platform.cusChar as any)?.DisplayLight,
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
      const newValueKey = value / 20;
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
        this.cacheMode * 20,
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
          'aa05': (hexParts) => this.handleSpeedUpdate(hexParts),
          '3a05': (hexParts) => this.handleSpeedUpdate(hexParts),
          'aa10': (hexParts) => this.handleLockUpdate(hexParts),
          'aa16': (hexParts, hexString) => this.handleDisplayUpdate(hexParts, hexString),
          'aa1c': (hexParts) => this.handleAirQualityUpdate(hexParts),
          // Ignored commands
          'aa11': () => {}, // timer
          'aa13': () => {}, // scheduling
          '3310': () => {}, // lock
          '3311': () => {}, // timer
          '3313': () => {}, // scheduling
          '3316': () => {}, // display light
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
    if (newSpeedCode === '0202') {
      this.accessory.log(`${platformLang.curMode} [custom]`);
      return;
    }

    const speedCodeMap: Record<string, number> = {
      '0500': 1, // Sleep
      '0101': 2, // Low
      '0102': 3, // Medium
      '0103': 4, // High
      '0300': 5, // Auto
    };

    const newMode = speedCodeMap[newSpeedCode];
    if (newMode && newMode !== this.cacheMode) {
      this.cacheMode = newMode;
      this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheMode * 20);
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

  private handleAirQualityUpdate(hexParts: string[]): void {
    const qualHex = `${getTwoItemPosition(hexParts, 4)}${getTwoItemPosition(hexParts, 5)}`;
    const qualDec = hexToDecimal(`0x${qualHex}`);
    if (qualDec === this.cacheAir) {
      return;
    }

    this.cacheAir = qualDec;
    this.airService.updateCharacteristic(this.hapChar.PM2_5Density, this.cacheAir);
    this.accessory.log(`${platformLang.curPM25} [${qualDec}µg/m³]`);

    // Update air quality based on PM2.5 ranges (Govee manual)
    // 0-12µg/m³ = excellent, 12-35 = good, 35-75 = fair, 75-115 = inferior, 115+ = poor
    let newAirQual: string;
    let airQualValue: number;

    if (this.cacheAir <= 12) {
      newAirQual = 'excellent';
      airQualValue = 1;
    } else if (this.cacheAir <= 35) {
      newAirQual = 'good';
      airQualValue = 2;
    } else if (this.cacheAir <= 75) {
      newAirQual = 'fair';
      airQualValue = 3;
    } else if (this.cacheAir <= 115) {
      newAirQual = 'inferior';
      airQualValue = 4;
    } else {
      newAirQual = 'poor';
      airQualValue = 5;
    }

    if (this.cacheAirQual !== newAirQual) {
      this.cacheAirQual = newAirQual;
      this.airService.updateCharacteristic(this.hapChar.AirQuality, airQualValue);
      this.accessory.log(`${platformLang.curAirQual} [${newAirQual}]`);
    }
  }
}

export default PurifierH7122Device;
