import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  generateRandomString,
  getTwoItemPosition,
  processCommands,
  speedPercentToValue,
  speedValueToPercent,
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

  private static readonly MAX_SPEED = 4;

  // Cached values
  private cacheSpeed = 0;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove any old services from simulations
    const servicesToRemove = ['HeaterCooler', 'Lightbulb', 'Outlet', 'Switch', 'Valve'] as const;
    for (const serviceName of servicesToRemove) {
      this.removeServiceIfExists(serviceName);
    }

    // Add the AirPurifier service if it doesn't already exist
    this._service = this.getOrAddService(this.hapServ.AirPurifier);

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

      await this.sendDeviceUpdate({ cmd: 'statePuri', value: newValue });

      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);

      // Add the entry to the Eve history service
      if (this.accessory.eveService) {
        this.accessory.eveService.addEntry({ status: value ? 1 : 0 });
      }
      this._service.updateCharacteristic(this.hapChar.CurrentAirPurifierState, value === 1 ? 2 : 0);
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

      const newValue = speedPercentToValue(value, PurifierFullDevice.MAX_SPEED, Math.round);
      const newPercent = speedValueToPercent(newValue, PurifierFullDevice.MAX_SPEED);

      if (newPercent === this.cacheSpeed) {
        return;
      }

      await this.sendDeviceUpdate({ cmd: 'ptReal', value: SPEED_VALUE_CODES[newValue] });

      this.cacheSpeed = newPercent;
      this.accessory.log(`${platformLang.curSpeed} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.RotationSpeed),
        this.cacheSpeed,
      );
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

    if (params.commands) {
      processCommands(
        params.commands,
        {
          '0500': (hexParts) => this.handleSpeedUpdate(hexParts),
          '0501': (hexParts) => this.handleSpeedUpdate(hexParts),
          '0502': (hexParts) => this.handleSpeedUpdate(hexParts),
          '0503': (hexParts) => this.handleSpeedUpdate(hexParts),
          '0510': (hexParts) => this.handleSpeedUpdate(hexParts),
        },
        (command, hexString) => {
          this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        },
      );
    }
  }

  private handleSpeedUpdate(hexParts: string[]): void {
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
  }
}

export default PurifierFullDevice;
