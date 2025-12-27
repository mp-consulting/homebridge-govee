import type { Service, HAPStatus } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams, FanDeviceConfig } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';
import {
  base64ToHex,
  generateCodeFromHexValues,
  generateRandomString,
  getTwoItemPosition,
  hexToDecimal,
  hexToTwoItems,
  parseError,
  sleep,
  hs2rgb,
  rgb2hs,
} from '../utils/functions.js';

// Speed codes for 12-speed fans (H7105, H7107)
const SPEED_CODES_12: Record<number, string> = {
  1: 'MwUBAQAAAAAAAAAAAAAAAAAAADY=',
  2: 'MwUBAgAAAAAAAAAAAAAAAAAAADU=',
  3: 'MwUBAwAAAAAAAAAAAAAAAAAAADQ=',
  4: 'MwUBBAAAAAAAAAAAAAAAAAAAADM=',
  5: 'MwUBBQAAAAAAAAAAAAAAAAAAADI=',
  6: 'MwUBBgAAAAAAAAAAAAAAAAAAADE=',
  7: 'MwUBBwAAAAAAAAAAAAAAAAAAADA=',
  8: 'MwUBCAAAAAAAAAAAAAAAAAAAAD8=',
  9: 'MwUBCQAAAAAAAAAAAAAAAAAAAD4=',
  10: 'MwUBCgAAAAAAAAAAAAAAAAAAAD0=',
  11: 'MwUBCwAAAAAAAAAAAAAAAAAAADw=',
  12: 'MwUBDAAAAAAAAAAAAAAAAAAAADs=',
};

/**
 * Fan device handler for models with 12 speeds and integrated light (H7105, H7107).
 */
export class FanLightDevice extends GoveeDeviceBase {
  private _service!: Service;
  private lightService?: Service;

  // Speed codes
  protected speedCodes: Record<number, string> = SPEED_CODES_12;
  protected maxSpeed = 12;

  // Cached values
  private cacheSpeed = 0;
  private cacheSwing: 'on' | 'off' = 'off';
  private cacheLightState: 'on' | 'off' = 'off';
  private cacheBright = 100;
  private cacheHue = 0;
  private cacheSat = 0;

  // Debounce keys
  private updateKeyBright?: string;
  private updateKeyColour?: string;

  // Config
  private hideLight = false;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Get device config
    const deviceConf = this.platform.deviceConf[this.accessory.context.gvDeviceId] as Partial<FanDeviceConfig> | undefined;
    this.hideLight = deviceConf?.hideLight ?? false;

    // Remove any old original Fan services
    this.removeServiceIfExists('Fan');

    // Migrate old %-rotation speed to unitless
    const existingService = this.accessory.getService(this.hapServ.Fanv2);
    if (existingService) {
      const props = existingService.getCharacteristic(this.hapChar.RotationSpeed).props;
      if (props.unit === 'percentage') {
        this.accessory.removeService(existingService);
      }
    }

    // Add the fan service for the fan if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.Fanv2)
      || this.accessory.addService(this.hapServ.Fanv2);

    // Add the set handler to the fan on/off characteristic
    this._service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async (value) => this.internalStateUpdate(value as number));
    this.cacheState = this._service.getCharacteristic(this.hapChar.Active).value ? 'on' : 'off';

    // Add the set handler to the fan rotation speed characteristic (1-12 speeds)
    this._service
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({
        maxValue: this.maxSpeed,
        minStep: 1,
        minValue: 0,
        unit: 'unitless' as unknown as undefined,
      })
      .onSet(async (value) => this.internalSpeedUpdate(value as number));
    this.cacheSpeed = this._service.getCharacteristic(this.hapChar.RotationSpeed).value as number;

    // Add the set handler to the fan swing mode
    this._service
      .getCharacteristic(this.hapChar.SwingMode)
      .onSet(async (value) => this.internalSwingUpdate(value as number));
    this.cacheSwing = this._service.getCharacteristic(this.hapChar.SwingMode).value === 1 ? 'on' : 'off';

    // Setup light service
    if (this.hideLight) {
      // Remove the light service if it exists
      const existingLight = this.accessory.getService(this.hapServ.Lightbulb);
      if (existingLight) {
        this.accessory.removeService(existingLight);
      }
    } else {
      // Add the night light service if it doesn't already exist
      this.lightService = this.accessory.getService(this.hapServ.Lightbulb)
        || this.accessory.addService(this.hapServ.Lightbulb);

      // Add the set handler to the lightbulb on/off characteristic
      this.lightService.getCharacteristic(this.hapChar.On)
        .onSet(async (value) => this.internalLightStateUpdate(value as boolean));
      this.cacheLightState = this.lightService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

      // Add the set handler to the lightbulb brightness characteristic
      this.lightService.getCharacteristic(this.hapChar.Brightness)
        .onSet(async (value) => this.internalBrightnessUpdate(value as number));
      this.cacheBright = this.lightService.getCharacteristic(this.hapChar.Brightness).value as number;

      // Add the set handler to the lightbulb hue characteristic
      this.lightService.getCharacteristic(this.hapChar.Hue)
        .onSet(async (value) => this.internalColourUpdate(value as number));
      this.cacheHue = this.lightService.getCharacteristic(this.hapChar.Hue).value as number;
      this.cacheSat = this.lightService.getCharacteristic(this.hapChar.Saturation).value as number;
    }

    // Output the customised options to the log
    this.logInitOptions({ hideLight: this.hideLight });

    this.initialised = true;
  }

  private async internalStateUpdate(value: number): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      if (this.cacheState === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: value ? 'MwEBAAAAAAAAAAAAAAAAAAAAADM=' : 'MwEAAAAAAAAAAAAAAAAAAAAAADI=',
      });

      if (this.cacheState !== newValue) {
        this.cacheState = newValue;
        this.accessory.log(`${platformLang.curState} [${newValue}]`);
      }
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
      if (this.cacheSpeed === value || value === 0) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'ptReal',
        value: this.speedCodes[value],
      });

      if (this.cacheSpeed !== value) {
        this.cacheSpeed = value;
        this.accessory.log(`${platformLang.curSpeed} [${value}]`);
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalSwingUpdate(value: number): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      if (this.cacheSwing === newValue) {
        return;
      }

      // Swing mode update not fully implemented for this model
      this.accessory.logWarn('Swing mode control not yet implemented for this model');

      this.cacheSwing = newValue;
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.SwingMode, this.cacheSwing === 'on' ? 1 : 0);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalLightStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      if (this.cacheLightState === newValue) {
        return;
      }

      // Generate the hex values for the code
      const hexValues = [0x3A, 0x1B, 0x01, 0x01, value ? 0x01 : 0x00];

      await this.sendDeviceUpdate({
        cmd: 'multiSync',
        value: generateCodeFromHexValues(hexValues),
      });

      if (this.cacheLightState !== newValue) {
        this.cacheLightState = newValue;
        this.accessory.log(`${platformLang.curLight} [${newValue}]`);
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      setTimeout(() => {
        this.lightService?.updateCharacteristic(this.hapChar.On, this.cacheLightState === 'on');
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalBrightnessUpdate(value: number): Promise<void> {
    try {
      // Debounce
      const updateKeyBright = generateRandomString(5);
      this.updateKeyBright = updateKeyBright;
      await sleep(350);
      if (updateKeyBright !== this.updateKeyBright) {
        return;
      }

      if (value === this.cacheBright) {
        return;
      }

      // Generate the hex values for the code
      const hexValues = [0x3A, 0x1B, 0x01, 0x02, value];

      await this.sendDeviceUpdate({
        cmd: 'multiSync',
        value: generateCodeFromHexValues(hexValues),
      });

      // Govee considers 0% brightness to be off
      if (value === 0) {
        setTimeout(() => {
          this.cacheLightState = 'off';
          if (this.lightService?.getCharacteristic(this.hapChar.On).value) {
            this.lightService.updateCharacteristic(this.hapChar.On, false);
            this.accessory.log(`${platformLang.curLight} [${this.cacheLightState}]`);
          }
          this.lightService?.updateCharacteristic(this.hapChar.Brightness, this.cacheBright);
        }, 1500);
        return;
      }

      if (this.cacheBright !== value) {
        this.cacheBright = value;
        this.accessory.log(`${platformLang.curBright} [${value}%]`);
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      setTimeout(() => {
        this.lightService?.updateCharacteristic(this.hapChar.Brightness, this.cacheBright);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  private async internalColourUpdate(value: number): Promise<void> {
    try {
      // Debounce
      const updateKeyColour = generateRandomString(5);
      this.updateKeyColour = updateKeyColour;
      await sleep(300);
      if (updateKeyColour !== this.updateKeyColour) {
        return;
      }

      if (value === this.cacheHue) {
        return;
      }

      // Calculate RGB values
      const saturation = this.lightService?.getCharacteristic(this.hapChar.Saturation).value as number;
      const newRGB = hs2rgb(value, saturation);

      // Generate the hex values for the code
      const hexValues = [0x3A, 0x1B, 0x05, 0x0D, ...newRGB];

      await this.sendDeviceUpdate({
        cmd: 'multiSync',
        value: generateCodeFromHexValues(hexValues),
      });

      if (this.cacheHue !== value) {
        this.cacheHue = value;
        this.accessory.log(`${platformLang.curColour} [rgb ${newRGB.join(' ')}]`);
      }
    } catch (err) {
      this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      setTimeout(() => {
        this.lightService?.updateCharacteristic(this.hapChar.Hue, this.cacheHue);
      }, 2000);
      throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Update the active characteristic
    if (params.state && params.state !== this.cacheState) {
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0);
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

      if (getTwoItemPosition(hexParts, 2) === '08') {
        // Sensor Attached?
        const dev = hexString.substring(4, hexString.length - 24);
        this.accessory.context.sensorAttached = dev !== '000000000000';
        continue;
      }

      const deviceFunction = `${getTwoItemPosition(hexParts, 2)}${getTwoItemPosition(hexParts, 3)}`;

      switch (deviceFunction) {
      case '0501': {
        // Fan speed
        const newSpeed = getTwoItemPosition(hexParts, 4);
        const newSpeedInt = Number.parseInt(newSpeed, 16);
        if (this.cacheSpeed !== newSpeedInt) {
          this.cacheSpeed = newSpeedInt;
          this._service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed);
          this.accessory.log(`${platformLang.curSpeed} [${this.cacheSpeed}]`);
        }
        break;
      }
      case '1b01': {
        // Night light on/off and brightness
        if (!this.hideLight && this.lightService) {
          const newLightState = getTwoItemPosition(hexParts, 4) === '01' ? 'on' : 'off';
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
        break;
      }
      case '1b05': {
        // Night light colour
        if (!this.hideLight && this.lightService) {
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
        break;
      }
      default:
        this.accessory.logDebugWarn(`${platformLang.newScene}: [${command}] [${hexString}]`);
        break;
      }
    }
  }
}

export default FanLightDevice;
