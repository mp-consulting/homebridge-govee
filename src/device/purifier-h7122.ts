import type { Service, HAPStatus } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  base64ToHex,
  getTwoItemPosition,
  hexToBase64,
  hexToDecimal,
  hexToTwoItems,
  parseError,
  statusToActionCode,
} from '../utils/functions.js';

// Speed codes for H7122 model (5 modes: sleep, low, med, high, auto)
const SPEED_VALUE_CODES: Record<number, string> = {
  1: 'OgUFAAAAAAAAAAAAAAAAAAAAADo=', // sleep
  2: 'OgUBAQAAAAAAAAAAAAAAAAAAAD8=', // low
  3: 'OgUBAgAAAAAAAAAAAAAAAAAAADw=', // med
  4: 'OgUBAwAAAAAAAAAAAAAAAAAAAD0=', // high
  5: 'OgUDAAAAAAAAAAAAAAAAAAAAADw=', // auto
};

const SPEED_VALUE_LABELS: Record<number, string> = {
  0: 'off',
  1: 'sleep',
  2: 'low',
  3: 'medium',
  4: 'high',
  5: 'auto',
};

// Lock codes
const LOCK_CODES: Record<'on' | 'off', string> = {
  on: 'MxABAAAAAAAAAAAAAAAAAAAAACI=',
  off: 'MxAAAAAAAAAAAAAAAAAAAAAAACM=',
};

// Display codes
const DISPLAY_CODES: Record<'on' | 'off', string> = {
  on: 'MxYBAAAAAAAAAAAAAAAAAAAAACQ=',
  off: 'MxYAAAAAAAAAAAAAAAAAAAAAACU=',
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

  // Custom characteristics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private displayLightChar?: any;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Add the purifier service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.AirPurifier)
      || this.accessory.addService(this.hapServ.AirPurifier);

    // Add the air quality service if it doesn't already exist
    this.airService = this.accessory.getService(this.hapServ.AirQualitySensor)
      || this.accessory.addService(this.hapServ.AirQualitySensor);

    // Add PM2.5 Density characteristic if not present
    if (!this.airService.testCharacteristic(this.hapChar.PM2_5Density)) {
      this.airService.addCharacteristic(this.hapChar.PM2_5Density);
    }
    this.cacheAir = this.airService.getCharacteristic(this.hapChar.PM2_5Density).value as number;

    // Add the set handler to the switch on/off characteristic
    this._service.getCharacteristic(this.hapChar.Active).onSet(async (value) => {
      await this.internalStateUpdate(value as number);
    });
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off';

    // Add options to the purifier target state characteristic
    this._service
      .getCharacteristic(this.hapChar.TargetAirPurifierState)
      .updateValue(1)
      .setProps({
        minValue: 1,
        maxValue: 1,
        validValues: [1],
      });

    // Add the set handler to the fan rotation speed characteristic (5 speeds at 20% increments)
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        minStep: 20,
        validValues: [0, 20, 40, 60, 80, 100],
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheMode = (this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number) / 20 || 1;

    // Add the set handler to the lock controls characteristic
    this._service.getCharacteristic(this.hapChar.LockPhysicalControls).onSet(async (value) => {
      await this.internalLockUpdate(value as number);
    });
    this.cacheLock = this._service.getCharacteristic(this.hapChar.LockPhysicalControls).value === 1 ? 'on' : 'off';

    // Add display light custom characteristic if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const displayLightClass = (this.platform.cusChar as any)?.DisplayLight;
    if (displayLightClass) {
      if (!this._service.testCharacteristic(displayLightClass)) {
        this._service.addCharacteristic(displayLightClass);
      }

      this.displayLightChar = this._service.getCharacteristic(displayLightClass);
      this.displayLightChar.onSet(async (value: boolean) => {
        await this.internalDisplayLightUpdate(value);
      });
      this.cacheDisplay = this.displayLightChar.value ? 'on' : 'off';
    }

    // Output the customised options to the log
    this.logInitOptions({});

    this.initialised = true;
  }

  private async internalStateUpdate(value: number): Promise<void> {
    try {
      const newValue = value === 1 ? 'on' : 'off';

      // Don't continue if the new value is the same as before
      if (this.cacheState === newValue) {
        return;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'statePuri',
        value: value ? 1 : 0,
      });

      // Update the current state characteristic
      this._service.updateCharacteristic(this.hapChar.CurrentAirPurifierState, value === 1 ? 2 : 0);

      // Cache the new state and log if appropriate
      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      // Don't continue if the speed is 0
      if (value === 0) {
        return;
      }

      // Get the mode key {1, 2, 3, 4, 5}
      const newValueKey = value / 20;

      // Don't continue if the speed value won't have effect
      if (!newValueKey || newValueKey === this.cacheMode) {
        return;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: SPEED_VALUE_CODES[newValueKey],
      });

      // Cache the new state and log if appropriate
      this.cacheMode = newValueKey;
      this.accessory.log(`${platformLang.curMode} [${SPEED_VALUE_LABELS[this.cacheMode]}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheMode * 20);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalLockUpdate(value: number): Promise<void> {
    try {
      const newValue = value === 1 ? 'on' : 'off';

      // Don't continue if the new value is the same as before
      if (this.cacheLock === newValue) {
        return;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: LOCK_CODES[newValue],
      });

      // Cache the new state and log if appropriate
      this.cacheLock = newValue;
      this.accessory.log(`${platformLang.curLock} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        this._service.updateCharacteristic(
          this.hapChar.LockPhysicalControls,
          this.cacheLock === 'on' ? 1 : 0,
        );
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalDisplayLightUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      // Don't continue if the new value is the same as before
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

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: codeToSend,
      });

      // Cache the new state and log if appropriate
      this.cacheDisplay = newValue;
      this.accessory.log(`${platformLang.curDisplay} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        if (this.displayLightChar) {
          this.displayLightChar.updateValue(this.cacheDisplay === 'on');
        }
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check for an ON/OFF change
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      this._service.updateCharacteristic(this.hapChar.CurrentAirPurifierState, this.cacheState === 'on' ? 2 : 0);

      // Log the change
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
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

      const deviceFunction = `${getTwoItemPosition(hexParts, 1)}${getTwoItemPosition(hexParts, 2)}`;

      switch (deviceFunction) {
      case 'aa05': // speed
      case '3a05': { // speed
        const newSpeedCode = `${getTwoItemPosition(hexParts, 3)}${getTwoItemPosition(hexParts, 4)}`;

        // Different behaviour for custom speed
        if (newSpeedCode === '0202') {
          this.accessory.log(`${platformLang.curMode} [custom]`);
          continue;
        }

        let newMode: number | undefined;

        switch (newSpeedCode) {
        case '0500': // Sleep
          newMode = 1;
          break;
        case '0101': // Low
          newMode = 2;
          break;
        case '0102': // Medium
          newMode = 3;
          break;
        case '0103': // High
          newMode = 4;
          break;
        case '0300': // Auto
          newMode = 5;
          break;
        }

        if (newMode && newMode !== this.cacheMode) {
          this.cacheMode = newMode;
          this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheMode * 20);
          this.accessory.log(`${platformLang.curMode} [${SPEED_VALUE_LABELS[this.cacheMode]}]`);
        }
        break;
      }
      case 'aa10': { // lock
        const newLock = getTwoItemPosition(hexParts, 3) === '01' ? 'on' : 'off';
        if (newLock !== this.cacheLock) {
          this.cacheLock = newLock;
          this._service.updateCharacteristic(this.hapChar.LockPhysicalControls, this.cacheLock === 'on' ? 1 : 0);
          this.accessory.log(`${platformLang.curLock} [${this.cacheLock}]`);
        }
        break;
      }
      case 'aa16': { // display light
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
        break;
      }
      case 'aa1c': { // Air quality reading (PM2.5)
        const qualHex = `${getTwoItemPosition(hexParts, 4)}${getTwoItemPosition(hexParts, 5)}`;
        const qualDec = hexToDecimal(`0x${qualHex}`);
        if (qualDec !== this.cacheAir) {
          // Air quality is different so update Homebridge with new values
          this.cacheAir = qualDec;
          this.airService.updateCharacteristic(this.hapChar.PM2_5Density, this.cacheAir);
          this.accessory.log(`${platformLang.curPM25} [${qualDec}µg/m³]`);

          // Update the main air quality characteristic based on PM2.5 ranges
          // Scales based on Govee manual:
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
        break;
      }
      case 'aa11': // timer
      case 'aa13': // scheduling
      case '3310': // lock (same command for on and off)
      case '3311': // timer
      case '3313': // scheduling
      case '3316': { // display light
        break;
      }
      default:
        this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        break;
      }
    }
  }
}

export default PurifierH7122Device;
