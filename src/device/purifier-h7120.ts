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
} from '../utils/functions.js';

// Speed codes for H7120/H7121 model (4 speeds at 25% increments)
const SPEED_VALUE_CODES: Record<number, string> = {
  1: 'MwUQAAAAAAAAAAAAAAAAAAAAACY=', // sleep
  2: 'MwUBAAAAAAAAAAAAAAAAAAAAADc=', // low
  3: 'MwUCAAAAAAAAAAAAAAAAAAAAADQ=', // medium
  4: 'MwUDAAAAAAAAAAAAAAAAAAAAADU=', // high
};

// Night light codes
const NIGHT_LIGHT_CODES: Record<'on' | 'off', string> = {
  on: 'MxgBMgAAAAAAAAAAAAAAAAAAABg=',
  off: 'MxgAMgAAAAAAAAAAAAAAAAAAABk=',
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
 * Purifier device handler for H7120/H7121 models.
 * Supports on/off, 4-speed control, night light, lock, and display light.
 */
export class PurifierH7120Device extends GoveeDeviceBase {
  private _service!: Service;

  // Cached values
  private cacheSpeed = 25;
  private cacheLock: 'on' | 'off' = 'off';
  private cacheLight: 'on' | 'off' = 'off';
  private cacheDisplay: 'on' | 'off' = 'off';

  // Custom characteristics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private nightLightChar?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private displayLightChar?: any;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  /**
   * Convert rotation speed (0-100) to value (1-4)
   */
  private speed2Value(speed: number): number {
    return Math.min(Math.max(Math.floor(speed / 25), 1), 4);
  }

  init(): void {
    // Add the purifier service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.AirPurifier)
      || this.accessory.addService(this.hapServ.AirPurifier);

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

    // Add the set handler to the fan rotation speed characteristic (4 speeds at 25% increments)
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        minStep: 25,
        validValues: [0, 25, 50, 75, 100],
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number || 25;

    // Add the set handler to the lock controls characteristic
    this._service.getCharacteristic(this.hapChar.LockPhysicalControls).onSet(async (value) => {
      await this.internalLockUpdate(value as number);
    });
    this.cacheLock = this._service.getCharacteristic(this.hapChar.LockPhysicalControls).value === 1 ? 'on' : 'off';

    // Add night light custom characteristic if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nightLightClass = (this.platform.cusChar as any)?.NightLight;
    if (nightLightClass) {
      if (!this._service.testCharacteristic(nightLightClass)) {
        this._service.addCharacteristic(nightLightClass);
      }

      this.nightLightChar = this._service.getCharacteristic(nightLightClass);
      this.nightLightChar.onSet(async (value: boolean) => {
        await this.internalNightLightUpdate(value);
      });
      this.cacheLight = this.nightLightChar.value ? 'on' : 'off';
    }

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

      // Get the single Govee value {1, 2, 3, 4}
      const newValue = this.speed2Value(value);

      // Don't continue if the speed value won't have effect
      if (newValue * 25 === this.cacheSpeed) {
        return;
      }

      // Get the scene code for this value
      const newCode = SPEED_VALUE_CODES[newValue];

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: newCode,
      });

      // Cache the new state and log if appropriate
      this.cacheSpeed = newValue * 25;
      this.accessory.log(`${platformLang.curSpeed} [${this.cacheSpeed}%]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalNightLightUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      // Don't continue if the new value is the same as before
      if (this.cacheLight === newValue) {
        return;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: NIGHT_LIGHT_CODES[newValue],
      });

      // Cache the new state and log if appropriate
      this.cacheLight = newValue;
      this.accessory.log(`${platformLang.curLight} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        if (this.nightLightChar) {
          this.nightLightChar.updateValue(this.cacheLight === 'on');
        }
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

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: DISPLAY_CODES[newValue],
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

      // Return now if not a device query update code
      if (getTwoItemPosition(hexParts, 1) !== 'aa') {
        continue;
      }

      const deviceFunction = `${getTwoItemPosition(hexParts, 1)}${getTwoItemPosition(hexParts, 2)}`;

      switch (deviceFunction) {
      default:
        this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        break;
      }
    }
  }
}

export default PurifierH7120Device;
