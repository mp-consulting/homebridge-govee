import type { Service, HAPStatus } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  base64ToHex,
  generateRandomString,
  getTwoItemPosition,
  hexToTwoItems,
  parseError,
} from '../utils/functions.js';

// Speed codes for H7121 model (Low=1, Medium=2, High=3, Sleep=16)
const SPEED_VALUE_CODES: Record<number, string> = {
  1: 'MwUQAAAAAAAAAAAAAAAAAAAAACY=', // Sleep (16 -> 0x10)
  2: 'MwUBAAAAAAAAAAAAAAAAAAAAADc=', // Low
  3: 'MwUCAAAAAAAAAAAAAAAAAAAAADQ=', // Medium
  4: 'MwUDAAAAAAAAAAAAAAAAAAAAADU=', // High
};

/**
 * Full-featured purifier device handler with speed control, night light, lock, and display.
 * Compatible with H7121 and similar models.
 */
export class PurifierFullDevice extends GoveeDeviceBase {
  private _service!: Service;

  // Update timeout
  private updateTimeout: string | false = false;

  // Cached values
  private cacheSpeed = 0;

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
    return Math.min(Math.max(Math.round(speed / 25), 1), 4);
  }

  init(): void {
    // Remove any old services from simulations
    const servicesToRemove = ['HeaterCooler', 'Lightbulb', 'Outlet', 'Switch', 'Valve'] as const;
    for (const serviceName of servicesToRemove) {
      this.removeServiceIfExists(serviceName);
    }

    // Add the AirPurifier service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.AirPurifier)
      || this.accessory.addService(this.hapServ.AirPurifier);

    // Set up Active characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off';

    // Set up Target Air Purifier State (manual only)
    this._service
      .getCharacteristic(this.hapChar.TargetAirPurifierState)
      .updateValue(1)
      .setProps({
        minValue: 1,
        maxValue: 1,
        validValues: [1],
      });

    // Set up Rotation Speed characteristic
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        minStep: 25,
        validValues: [0, 25, 50, 75, 100],
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('switch', this.accessory, {
      log: () => {},
    }) as unknown as import('../types.js').EveHistoryService;

    // Output the customised options to the log
    this.logInitOptions({ showAs: 'purifier' });

    this.initialised = true;
  }

  private async internalStateUpdate(value: number): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value === 1 ? 'on' : 'off';

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

      await this.sendDeviceUpdate({
        cmd: 'statePuri',
        value: newValue,
      });

      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);

      // Add the entry to the Eve history service
      if (this.accessory.eveService) {
        this.accessory.eveService.addEntry({ status: value ? 1 : 0 });
      }
      this._service.updateCharacteristic(this.hapChar.CurrentAirPurifierState, value === 1 ? 2 : 0);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      if (value === 0) {
        return;
      }

      const newValue = this.speed2Value(value);

      if (newValue * 25 === this.cacheSpeed) {
        return;
      }

      const newCode = SPEED_VALUE_CODES[newValue];

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: newCode,
      });

      this.cacheSpeed = newValue * 25;
      this.accessory.log(`${platformLang.curSpeed} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Check to see if the provided state is different from the cached state
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      this._service.updateCharacteristic(
        this.hapChar.CurrentAirPurifierState,
        this.cacheState === 'on' ? 2 : 0,
      );

      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);

      // Add the entry to the Eve history service
      if (this.accessory.eveService) {
        this.accessory.eveService.addEntry({
          status: this.cacheState === 'on' ? 1 : 0,
        });
      }
    }

    // Check for command updates
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

      const deviceFunction = `${getTwoItemPosition(hexParts, 2)}${getTwoItemPosition(hexParts, 3)}`;

      switch (deviceFunction) {
      case '0500':
      case '0501':
      case '0502':
      case '0503':
      case '0510': {
        // Speed update (0500 = mode selection, others are specific speeds)
        const modeValue = Number.parseInt(getTwoItemPosition(hexParts, 4), 16);
        let speedPercent = 0;
        switch (modeValue) {
        case 0x10: // Sleep
          speedPercent = 25;
          break;
        case 0x01: // Low
          speedPercent = 50;
          break;
        case 0x02: // Medium
          speedPercent = 75;
          break;
        case 0x03: // High
          speedPercent = 100;
          break;
        }
        if (speedPercent > 0 && this.cacheSpeed !== speedPercent) {
          this.cacheSpeed = speedPercent;
          this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
          this.accessory.log(`${platformLang.curSpeed} [${speedPercent}%]`);
        }
        break;
      }
      default:
        this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        break;
      }
    }
  }
}

export default PurifierFullDevice;
