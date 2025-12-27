import type { Service, HAPStatus } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  base64ToHex,
  farToCen,
  getTwoItemPosition,
  hasProperty,
  hexToTwoItems,
  nearestHalf,
  parseError,
} from '../utils/functions.js';

/**
 * Heater 1B device handler for H7130 (with temperature reporting).
 * Uses HeaterCooler service with Fan service for speed control.
 */
export class Heater1bDevice extends GoveeDeviceBase {
  private _service!: Service;
  private fanService!: Service;

  // Speed codes (base64 encoded commands)
  private readonly speedCode: Record<number, string> = {
    33: 'MwUBAAAAAAAAAAAAAAAAAAAAADc=',
    66: 'MwUCAAAAAAAAAAAAAAAAAAAAADQ=',
    99: 'MwUDAAAAAAAAAAAAAAAAAAAAADU=',
  };

  private readonly speedCodeLabel: Record<number, string> = {
    33: 'low',
    66: 'medium',
    99: 'high',
  };

  // Temperature codes for auto mode
  private readonly tempCodeAuto: Record<number, string> = {
    5: 'MxoBAJAEAAAAAAAAAAAAAAAAALw=',
    6: 'MxoBAJBoAAAAAAAAAAAAAAAAANA=',
    7: 'MxoBAJEwAAAAAAAAAAAAAAAAAIk=',
    8: 'MxoBAJH4AAAAAAAAAAAAAAAAAEE=',
    9: 'MxoBAJLAAAAAAAAAAAAAAAAAAHo=',
    10: 'MxoBAJOIAAAAAAAAAAAAAAAAADM=',
    11: 'MxoBAJPsAAAAAAAAAAAAAAAAAFc=',
    12: 'MxoBAJS0AAAAAAAAAAAAAAAAAAg=',
    13: 'MxoBAJV8AAAAAAAAAAAAAAAAAME=',
    14: 'MxoBAJZEAAAAAAAAAAAAAAAAAPo=',
    15: 'MxoBAJcMAAAAAAAAAAAAAAAAALM=',
    16: 'MxoBAJdwAAAAAAAAAAAAAAAAAM8=',
    17: 'MxoBAJg4AAAAAAAAAAAAAAAAAIg=',
    18: 'MxoBAJkAAAAAAAAAAAAAAAAAALE=',
    19: 'MxoBAJnIAAAAAAAAAAAAAAAAAHk=',
    20: 'MxoBAJqQAAAAAAAAAAAAAAAAACI=',
    21: 'MxoBAJr0AAAAAAAAAAAAAAAAAEY=',
    22: 'MxoBAJu8AAAAAAAAAAAAAAAAAA8=',
    23: 'MxoBAJyEAAAAAAAAAAAAAAAAADA=',
    24: 'MxoBAJ1MAAAAAAAAAAAAAAAAAPk=',
    25: 'MxoBAJ4UAAAAAAAAAAAAAAAAAKI=',
    26: 'MxoBAJ54AAAAAAAAAAAAAAAAAM4=',
    27: 'MxoBAJ9AAAAAAAAAAAAAAAAAAPc=',
    28: 'MxoBAKAIAAAAAAAAAAAAAAAAAIA=',
    29: 'MxoBAKDQAAAAAAAAAAAAAAAAAFg=',
    30: 'MxoBAKGYAAAAAAAAAAAAAAAAABE=',
  };

  // Temperature codes for heat mode
  private readonly tempCodeHeat: Record<number, string> = {
    5: 'MxoAAJAEAAAAAAAAAAAAAAAAAL0=',
    6: 'MxoAAJBoAAAAAAAAAAAAAAAAANE=',
    7: 'MxoAAJEwAAAAAAAAAAAAAAAAAIg=',
    8: 'MxoAAJH4AAAAAAAAAAAAAAAAAEA=',
    9: 'MxoAAJLAAAAAAAAAAAAAAAAAAHs=',
    10: 'MxoAAJOIAAAAAAAAAAAAAAAAADI=',
    11: 'MxoAAJPsAAAAAAAAAAAAAAAAAFY=',
    12: 'MxoAAJS0AAAAAAAAAAAAAAAAAAk=',
    13: 'MxoAAJV8AAAAAAAAAAAAAAAAAMA=',
    14: 'MxoAAJZEAAAAAAAAAAAAAAAAAPs=',
    15: 'MxoAAJcMAAAAAAAAAAAAAAAAALI=',
    16: 'MxoAAJdwAAAAAAAAAAAAAAAAAM4=',
    17: 'MxoAAJg4AAAAAAAAAAAAAAAAAIk=',
    18: 'MxoAAJkAAAAAAAAAAAAAAAAAALA=',
    19: 'MxoAAJnIAAAAAAAAAAAAAAAAAHg=',
    20: 'MxoAAJqQAAAAAAAAAAAAAAAAACM=',
    21: 'MxoAAJr0AAAAAAAAAAAAAAAAAEc=',
    22: 'MxoAAJu8AAAAAAAAAAAAAAAAAA4=',
    23: 'MxoAAJyEAAAAAAAAAAAAAAAAADE=',
    24: 'MxoAAJ1MAAAAAAAAAAAAAAAAAPg=',
    25: 'MxoAAJ4UAAAAAAAAAAAAAAAAAKM=',
    26: 'MxoAAJ54AAAAAAAAAAAAAAAAAM8=',
    27: 'MxoAAJ9AAAAAAAAAAAAAAAAAAPY=',
    28: 'MxoAAKAIAAAAAAAAAAAAAAAAAIE=',
    29: 'MxoAAKDQAAAAAAAAAAAAAAAAAFk=',
    30: 'MxoAAKGYAAAAAAAAAAAAAAAAABA=',
  };

  // Cached values
  private cacheMode: 'auto' | 'heat' = 'auto';
  private cacheTemp = 20;
  private cacheTarg = 20;
  private cacheSpeed = 33;
  private cacheSwing: 'on' | 'off' = 'off';
  private cacheLock: 'on' | 'off' = 'off';
  private cacheFanState: 'on' | 'off' = 'off';

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove old services
    this.removeServiceIfExists('Lightbulb');
    this.removeServiceIfExists('Fanv2');

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
    this.cacheMode = this._service.getCharacteristic(this.hapChar.TargetHeaterCoolerState).value === 0 ? 'auto' : 'heat';

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
        minStep: 33,
        validValues: [0, 33, 66, 99],
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this.fanService.getCharacteristic(this.hapChar.RotationSpeed).value as number;

    // Output the customised options to the log
    this.logInitOptions({ tempReporting: true });

    this.initialised = true;
  }

  private async internalStateUpdate(value: number): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value === 1 ? 'on' : 'off';

      if (this.cacheState === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: value ? 'MwEBAAAAAAAAAAAAAAAAAAAAADM=' : 'MwEAAAAAAAAAAAAAAAAAAAAAADI=',
      });

      this.cacheState = newValue;
      this.accessory.log(`${platformLang.curState} [${newValue}]`);

      // Fan state should also match
      if (this.cacheFanState !== newValue) {
        this.cacheFanState = newValue;
        this.fanService.updateCharacteristic(this.hapChar.On, newValue === 'on');
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalModeUpdate(value: number): Promise<void> {
    try {
      const newMode: 'auto' | 'heat' = value === 0 ? 'auto' : 'heat';

      if (this.cacheMode === newMode) {
        return;
      }

      const objectToChoose = newMode === 'auto' ? this.tempCodeAuto : this.tempCodeHeat;

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: objectToChoose[this.cacheTemp],
      });

      this.cacheMode = newMode;
      this.accessory.log(`${platformLang.curMode} [${newMode}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this._service.updateCharacteristic(
          this.hapChar.TargetHeaterCoolerState,
          this.cacheMode === 'auto' ? 0 : 1,
        );
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalTempUpdate(value: number): Promise<void> {
    try {
      if (this.cacheTarg === value) {
        return;
      }

      const objectToChoose = this.cacheMode === 'auto' ? this.tempCodeAuto : this.tempCodeHeat;

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: objectToChoose[value],
      });

      this.cacheTarg = value;
      this.accessory.log(`${platformLang.curTarg} [${this.cacheTarg}°C]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.HeatingThresholdTemperature, this.cacheTarg);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalSwingUpdate(value: number): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value === 1 ? 'on' : 'off';

      if (this.cacheSwing === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: value ? 'MxgBAAAAAAAAAAAAAAAAAAAAACo=' : 'MxgAAAAAAAAAAAAAAAAAAAAAACs=',
      });

      this.cacheSwing = newValue;
      this.accessory.log(`${platformLang.curSwing} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.SwingMode, this.cacheSwing === 'on' ? 1 : 0);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalLockUpdate(value: number): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value === 1 ? 'on' : 'off';

      if (this.cacheLock === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: value ? 'MxABAAAAAAAAAAAAAAAAAAAAACI=' : 'MxAAAAAAAAAAAAAAAAAAAAAAACM=',
      });

      this.cacheLock = newValue;
      this.accessory.log(`${platformLang.curLock} [${newValue}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.LockPhysicalControls, this.cacheLock === 'on' ? 1 : 0);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalFanStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue: 'on' | 'off' = value ? 'on' : 'off';

      if (this.cacheFanState === newValue) {
        return;
      }

      // Turning the fan on should only be possible if the main heater is off
      if (newValue === 'on') {
        setTimeout(() => {
          this.fanService.updateCharacteristic(this.hapChar.On, false);
        }, 3000);
        return;
      }

      // Turning fan off: revert to the previous fan speed
      setTimeout(() => {
        this.fanService.updateCharacteristic(this.hapChar.On, true);
        this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      }, 2000);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this.fanService.updateCharacteristic(this.hapChar.On, this.cacheFanState === 'on');
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalSpeedUpdate(value: number): Promise<void> {
    try {
      if (this.cacheSpeed === value || value === 0) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: this.speedCode[value],
      });

      this.cacheSpeed = value;
      this.accessory.log(`${platformLang.curSpeed} [${this.speedCodeLabel[value]}]`);
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

      setTimeout(() => {
        this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Update the active characteristic
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on');
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);

      // Fan state should also match
      if (this.cacheFanState !== this.cacheState) {
        this.cacheFanState = this.cacheState;
        this.fanService.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
      }
    }

    // Update the current temperature
    if (hasProperty(params, 'temperature')) {
      const newTemp = nearestHalf(farToCen(params.temperature! / 100));
      if (newTemp !== this.cacheTemp) {
        if (newTemp > 100) {
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
      const newTemp = Math.round(farToCen(params.setTemperature! / 100));
      if (newTemp !== this.cacheTarg) {
        this.cacheTarg = newTemp;
        this._service.updateCharacteristic(this.hapChar.HeatingThresholdTemperature, this.cacheTarg);
        this.accessory.log(`${platformLang.curTarg} [${this.cacheTarg}°C]`);
      }
    }

    // Check for command updates
    (params.commands || []).forEach((command: string) => {
      const hexString = base64ToHex(command);
      const hexParts = hexToTwoItems(hexString);

      if (getTwoItemPosition(hexParts, 1) !== 'aa') {
        return;
      }

      const deviceFunction = `${getTwoItemPosition(hexParts, 2)}${getTwoItemPosition(hexParts, 3)}`;

      switch (deviceFunction) {
      case '1800':
      case '1801': {
        const newSwing: 'on' | 'off' = getTwoItemPosition(hexParts, 3) === '01' ? 'on' : 'off';
        if (this.cacheSwing !== newSwing) {
          this.cacheSwing = newSwing;
          this._service.updateCharacteristic(this.hapChar.SwingMode, this.cacheSwing === 'on' ? 1 : 0);
          this.accessory.log(`${platformLang.curSwing} [${this.cacheSwing}]`);
        }
        break;
      }
      case '1000':
      case '1001': {
        const newLock: 'on' | 'off' = getTwoItemPosition(hexParts, 3) === '01' ? 'on' : 'off';
        if (this.cacheLock !== newLock) {
          this.cacheLock = newLock;
          this._service.updateCharacteristic(this.hapChar.LockPhysicalControls, this.cacheLock === 'on' ? 1 : 0);
          this.accessory.log(`${platformLang.curLock} [${this.cacheLock}]`);
        }
        break;
      }
      case '0501':
      case '0502':
      case '0503': {
        const speedByte = getTwoItemPosition(hexParts, 3);
        let newSpeed: number;
        switch (speedByte) {
        case '01':
          newSpeed = 33;
          break;
        case '02':
          newSpeed = 66;
          break;
        case '03':
          newSpeed = 99;
          break;
        default:
          return;
        }

        if (this.cacheState === 'on' && this.cacheFanState !== 'on') {
          this.cacheFanState = 'on';
          this.fanService.updateCharacteristic(this.hapChar.On, true);
          this.accessory.log(`${platformLang.curMode} [${this.cacheFanState}]`);
        }
        if (this.cacheSpeed !== newSpeed) {
          this.cacheSpeed = newSpeed;
          this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
          this.accessory.log(`${platformLang.curSpeed} [${this.speedCodeLabel[this.cacheSpeed]}]`);
        }
        break;
      }
      case '1a00':
      case '1a01': {
        const newMode: 'auto' | 'heat' = getTwoItemPosition(hexParts, 3) === '01' ? 'auto' : 'heat';
        if (this.cacheMode !== newMode) {
          this.cacheMode = newMode;
          this._service.updateCharacteristic(this.hapChar.TargetHeaterCoolerState, this.cacheMode === 'auto' ? 0 : 1);
          this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
        }
        break;
      }
      case '1100':
      case '1101':
      case '1300':
      case '1600':
      case '1601':
        // Timer/scheduling/DND - ignore
        break;
      default:
        this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        break;
      }
    });
  }
}

export default Heater1bDevice;
