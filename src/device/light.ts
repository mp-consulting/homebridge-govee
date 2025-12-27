import type { Service, AdaptiveLightingController } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams, LightDeviceConfig } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { hs2rgb, k2rgb, m2hs, rgb2hs } from '../utils/colour.js';
import { platformConsts, platformLang } from '../utils/index.js';
import { generateRandomString, hasProperty, parseError, sleep } from '../utils/functions.js';

// Scene characteristic names
const SCENE_CHAR_NAMES = [
  'DiyMode',
  'DiyModeTwo',
  'DiyModeThree',
  'DiyModeFour',
  'MusicMode',
  'MusicModeTwo',
  'Scene',
  'SceneTwo',
  'SceneThree',
  'SceneFour',
  'Segmented',
  'SegmentedTwo',
  'SegmentedThree',
  'SegmentedFour',
  'VideoMode',
  'VideoModeTwo',
] as const;

type SceneCharName = (typeof SCENE_CHAR_NAMES)[number];

/**
 * Light device handler for RGB/CCT lights.
 * Supports color, brightness, color temperature, and scene modes.
 */
export class LightDevice extends GoveeDeviceBase {
  private _service!: Service;
  private alController?: AdaptiveLightingController;

  // Custom characteristics reference
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cusChar: Record<string, any>;

  // Configuration
  private readonly alShift: number;
  private readonly brightStep: number;
  private readonly colourSafeMode: boolean;
  private readonly minKelvin: number;
  private readonly maxKelvin: number;

  // Scene management
  private usedCodes: SceneCharName[] = [];
  private hasScenes = false;

  // Cached values
  private cacheBright = 0;
  private cacheBrightRaw = 0;
  private cacheHue = 0;
  private cacheSat = 0;
  private cacheR = 0;
  private cacheG = 0;
  private cacheB = 0;
  private cacheKelvin = 0;
  private cacheMired = 0;
  private cacheScene = '';

  // Debounce keys
  private updateKeyBright?: string;
  private updateKeyColour?: string;
  private updateKeyCT?: string;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory);

    this.cusChar = platform.cusChar;
    this.colourSafeMode = platform.config.colourSafeMode ?? false;

    // Get kelvin range from device capabilities
    const supportedOpts = accessory.context.supportedCmdsOpts;
    this.minKelvin = supportedOpts?.colorTem?.range?.min ?? 2000;
    this.maxKelvin = supportedOpts?.colorTem?.range?.max ?? 9000;

    // Get device configuration
    const deviceConf = this.deviceConf as unknown as Partial<LightDeviceConfig>;
    this.alShift = deviceConf.adaptiveLightingShift ?? platformConsts.defaultValues.adaptiveLightingShift;
    this.brightStep = deviceConf.brightnessStep
      ? Math.min(deviceConf.brightnessStep, 100)
      : platformConsts.defaultValues.brightnessStep;
  }

  get service(): Service {
    return this._service;
  }

  init(): void {
    // Remove any switch service if it exists
    this.removeServiceIfExists('Switch');

    // Add the main lightbulb service if it doesn't already exist
    this._service = this.accessory.getService(this.hapServ.Lightbulb)
      || this.accessory.addService(this.hapServ.Lightbulb);

    // If adaptive lighting has just been disabled then remove and re-add service to hide AL icon
    if ((this.colourSafeMode || this.alShift === -1) && this.accessory.context.adaptiveLighting) {
      this.accessory.removeService(this._service);
      this._service = this.accessory.addService(this.hapServ.Lightbulb);
      this.accessory.context.adaptiveLighting = false;
    }

    // Setup custom characteristics for different scenes and modes
    this.setupSceneCharacteristics();

    // Add the colour mode characteristic if at least one other scene/mode is exposed
    this.setupColourModeCharacteristic();

    // Setup standard lightbulb characteristics
    this.setupLightbulbCharacteristics();

    // Set up the adaptive lighting controller if not disabled by user
    this.setupAdaptiveLighting();

    // Output the customised options to the log
    this.logInitOptions({
      adaptiveLightingShift: this.alShift,
      aws: this.hasAwsControl ? (this.useAwsControl ? 'enabled' : 'disabled') : 'unsupported',
      ble: this.hasBleControl ? (this.useBleControl ? 'enabled' : 'disabled') : 'unsupported',
      brightnessStep: this.brightStep,
      colourSafeMode: this.colourSafeMode,
      lan: this.hasLanControl ? (this.useLanControl ? 'enabled' : 'disabled') : 'unsupported',
    });

    this.initialised = true;
  }

  private setupSceneCharacteristics(): void {
    this.usedCodes = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deviceConf = this.deviceConf as any;

    for (const charName of SCENE_CHAR_NAMES) {
      const confName = charName.charAt(0).toLowerCase() + charName.slice(1);
      const confCode = deviceConf[confName] as { sceneCode?: string; bleCode?: string; showAs?: string } | undefined;

      // Check if any code has been entered in the config by the user
      if (confCode?.sceneCode) {
        const { bleCode, sceneCode } = confCode;

        // Add to the global enabled scenes list
        this.usedCodes.push(charName);

        if (confCode.showAs === 'switch') {
          this.setupSceneAsSwitch(charName, sceneCode, bleCode);
        } else {
          this.setupSceneAsEve(charName, sceneCode, bleCode);
        }
      } else {
        // Remove characteristic if no longer configured
        if (this.cusChar[charName] && this._service.testCharacteristic(this.cusChar[charName])) {
          this._service.removeCharacteristic(this._service.getCharacteristic(this.cusChar[charName]));
        }
      }
    }

    this.hasScenes = this.usedCodes.length > 0;
  }

  private setupSceneAsSwitch(charName: SceneCharName, sceneCode: string, bleCode?: string): void {
    // Remove the Eve switch if exists
    if (this.cusChar[charName] && this._service.testCharacteristic(this.cusChar[charName])) {
      this._service.removeCharacteristic(this._service.getCharacteristic(this.cusChar[charName]));
    }

    // Add the accessory service switch
    let switchService = this.accessory.getService(charName);
    if (!switchService) {
      switchService = this.accessory.addService(this.hapServ.Switch, charName, charName);
    }

    // Add the set handler and also mark all as off when initialising accessory
    switchService
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => {
        await this.internalSceneUpdate(charName, sceneCode, bleCode, value as boolean, true);
      })
      .updateValue(false);
  }

  private setupSceneAsEve(charName: SceneCharName, sceneCode: string, bleCode?: string): void {
    // Remove the accessory service switch if exists
    const existingSwitch = this.accessory.getService(charName);
    if (existingSwitch) {
      this.accessory.removeService(existingSwitch);
    }

    // Add the Eve switch
    if (this.cusChar[charName] && !this._service.testCharacteristic(this.cusChar[charName])) {
      this._service.addCharacteristic(this.cusChar[charName]);
    }

    // Add the set handler and also mark all as off when initialising accessory
    if (this.cusChar[charName]) {
      this._service
        .getCharacteristic(this.cusChar[charName])
        .onSet(async (value) => {
          await this.internalSceneUpdate(charName, sceneCode, bleCode, value as boolean, false);
        })
        .updateValue(false);
    }
  }

  private setupColourModeCharacteristic(): void {
    if (this.hasScenes) {
      // Add the colour mode characteristic if not already
      if (this.cusChar.ColourMode && !this._service.testCharacteristic(this.cusChar.ColourMode)) {
        this._service.addCharacteristic(this.cusChar.ColourMode);
      }

      // Add the set handler and also mark as off when initialising accessory
      if (this.cusChar.ColourMode) {
        this._service
          .getCharacteristic(this.cusChar.ColourMode)
          .onSet(async (value) => {
            if (value) {
              await this.internalColourUpdate(this.cacheHue, true);
            }
          })
          .updateValue(false);
      }
    } else if (this.cusChar.ColourMode && this._service.testCharacteristic(this.cusChar.ColourMode)) {
      // Remove the characteristic if it exists already (no need for it)
      this._service.removeCharacteristic(this._service.getCharacteristic(this.cusChar.ColourMode));
    }
  }

  private setupLightbulbCharacteristics(): void {
    // On/Off
    this._service.getCharacteristic(this.hapChar.On).onSet(async (value) => {
      await this.internalStateUpdate(value as boolean);
    });
    this.cacheState = this._service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';

    // Brightness
    this._service
      .getCharacteristic(this.hapChar.Brightness)
      .setProps({ minStep: this.brightStep })
      .onSet(async (value) => {
        await this.internalBrightnessUpdate(value as number);
      });
    this.cacheBright = this._service.getCharacteristic(this.hapChar.Brightness).value as number;
    this.cacheBrightRaw = this.cacheBright;

    // Hue
    this._service.getCharacteristic(this.hapChar.Hue).onSet(async (value) => {
      await this.internalColourUpdate(value as number);
    });
    this.cacheHue = this._service.getCharacteristic(this.hapChar.Hue).value as number;
    this.cacheSat = this._service.getCharacteristic(this.hapChar.Saturation).value as number;

    // Color Temperature
    if (this.colourSafeMode) {
      if (this._service.testCharacteristic(this.hapChar.ColorTemperature)) {
        this._service.removeCharacteristic(this._service.getCharacteristic(this.hapChar.ColorTemperature));
      }
      this.cacheMired = 0;
    } else {
      this._service.getCharacteristic(this.hapChar.ColorTemperature).onSet(async (value) => {
        await this.internalCTUpdate(value as number);
      });
      this.cacheMired = this._service.getCharacteristic(this.hapChar.ColorTemperature).value as number;
    }
  }

  private setupAdaptiveLighting(): void {
    if (!this.colourSafeMode && this.alShift !== -1) {
      this.alController = new this.platform.api.hap.AdaptiveLightingController(this._service, {
        customTemperatureAdjustment: this.alShift,
      });
      this.accessory.configureController(this.alController);
      this.accessory.context.adaptiveLighting = true;
    }
  }

  private async internalStateUpdate(value: boolean): Promise<void> {
    try {
      const newValue = value ? 'on' : 'off';

      // Don't continue if the new value is the same as before
      if (newValue === this.cacheState) {
        return;
      }

      // Await slightly longer than brightness and colour so on/off is sent last
      await sleep(400);

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'state',
        value: newValue,
      });

      // Cache the new state and log if appropriate
      if (this.cacheState !== newValue) {
        this.cacheState = newValue;
        this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
      }
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.On),
        this.cacheState === 'on',
      );
    }
  }

  private async internalBrightnessUpdate(value: number): Promise<void> {
    try {
      // This acts like a debounce function when endlessly sliding the brightness scale
      const updateKeyBright = generateRandomString(5);
      this.updateKeyBright = updateKeyBright;
      await sleep(350);
      if (updateKeyBright !== this.updateKeyBright) {
        return;
      }

      // Don't continue if the new value is the same as before
      if (value === this.cacheBright) {
        return;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'brightness',
        value,
      });

      // Govee considers 0% brightness to be off
      if (value === 0) {
        setTimeout(() => {
          this.cacheState = 'off';
          if (this._service.getCharacteristic(this.hapChar.On).value) {
            this._service.updateCharacteristic(this.hapChar.On, false);
            this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
          }
          this._service.updateCharacteristic(this.hapChar.Brightness, this.cacheBright);
        }, 1500);
        return;
      }

      // Cache the new state and log if appropriate
      if (this.cacheBright !== value) {
        this.cacheBright = value;
        this.accessory.log(`${platformLang.curBright} [${value}%]`);
      }
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.Brightness),
        this.cacheBright,
      );
    }
  }

  private async internalColourUpdate(value: number, force = false): Promise<void> {
    try {
      // This acts like a debounce function when endlessly sliding the colour wheel
      const updateKeyColour = generateRandomString(5);
      this.updateKeyColour = updateKeyColour;
      await sleep(300);
      if (updateKeyColour !== this.updateKeyColour) {
        return;
      }

      if (!this.colourSafeMode) {
        // Updating the cct to the lowest value mimics native adaptive lighting
        this._service.updateCharacteristic(this.hapChar.ColorTemperature, 140);
      }

      // Don't continue if the new value is the same as before
      const currentSat = this._service.getCharacteristic(this.hapChar.Saturation).value as number;
      const newRGB = hs2rgb(value, currentSat);
      if (
        !force &&
        newRGB[0] === this.cacheR &&
        newRGB[1] === this.cacheG &&
        newRGB[2] === this.cacheB
      ) {
        return;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'color',
        value: {
          r: newRGB[0],
          g: newRGB[1],
          b: newRGB[2],
        },
      });

      // Switch off any custom mode/scene characteristics and turn the on switch to on
      if (this.hasScenes) {
        setTimeout(() => {
          this._service.updateCharacteristic(this.hapChar.On, true);
          if (this.cusChar.ColourMode) {
            this._service.updateCharacteristic(this.cusChar.ColourMode, true);
          }
          this.usedCodes.forEach((thisCharName) => {
            if (this.cusChar[thisCharName] && this._service.testCharacteristic(this.cusChar[thisCharName])) {
              this._service.updateCharacteristic(this.cusChar[thisCharName], false);
            }
            const sceneSwitch = this.accessory.getService(thisCharName);
            if (sceneSwitch) {
              sceneSwitch.updateCharacteristic(this.hapChar.On, false);
            }
          });
        }, 1000);
      }

      // Cache the new state and log if appropriate
      this.cacheHue = value;
      this.cacheKelvin = 0;
      this.cacheScene = '';
      if (this.cacheR !== newRGB[0] || this.cacheG !== newRGB[1] || this.cacheB !== newRGB[2]) {
        [this.cacheR, this.cacheG, this.cacheB] = newRGB;
        this.accessory.log(`${platformLang.curColour} [rgb ${this.cacheR} ${this.cacheG} ${this.cacheB}]`);
      }
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.Hue),
        this.cacheHue,
      );
    }
  }

  private async internalCTUpdate(value: number): Promise<void> {
    try {
      // This acts like a debounce function when endlessly sliding the colour wheel
      const updateKeyCT = generateRandomString(5);
      this.updateKeyCT = updateKeyCT;
      await sleep(300);
      if (updateKeyCT !== this.updateKeyCT) {
        return;
      }

      // Convert mired to kelvin to nearest 100 (Govee seems to need this)
      const kelvin = Math.round(1000000 / value / 100) * 100;

      // Check and increase/decrease kelvin to range of device
      const k = Math.min(Math.max(kelvin, this.minKelvin), this.maxKelvin);

      // Don't continue if the new value is the same as before
      if (this.cacheState !== 'on' || this.cacheKelvin === k) {
        if (this.alController?.isAdaptiveLightingActive?.()) {
          this.accessory.logDebug(`${platformLang.skippingAL} [${k}K /${value}M]`);
        }
        return;
      }

      // Updating the hue/sat to the corresponding values mimics native adaptive lighting
      const hs = m2hs(value);
      this._service.updateCharacteristic(this.hapChar.Hue, hs[0]);
      this._service.updateCharacteristic(this.hapChar.Saturation, hs[1]);

      // Convert kelvin to rgb to use in case device doesn't support colour temperature
      const rgb = k2rgb(k);

      // Set up the command to send
      let objToSend: { cmd: string; value: number | { r: number; g: number; b: number } };

      // For BLE only models, convert to RGB, otherwise send kelvin value
      if (this.isBLEOnly) {
        objToSend = {
          cmd: 'color',
          value: { r: rgb[0], g: rgb[1], b: rgb[2] },
        };
      } else {
        objToSend = {
          cmd: 'colorTem',
          value: k,
        };
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate(objToSend);

      // Switch off any custom mode/scene characteristics and turn the on switch to on
      if (this.hasScenes) {
        setTimeout(() => {
          this._service.updateCharacteristic(this.hapChar.On, true);
          if (this.cusChar.ColourMode) {
            this._service.updateCharacteristic(this.cusChar.ColourMode, true);
          }
          this.usedCodes.forEach((thisCharName) => {
            if (this.cusChar[thisCharName] && this._service.testCharacteristic(this.cusChar[thisCharName])) {
              this._service.updateCharacteristic(this.cusChar[thisCharName], false);
            }
            const sceneSwitch = this.accessory.getService(thisCharName);
            if (sceneSwitch) {
              sceneSwitch.updateCharacteristic(this.hapChar.On, false);
            }
          });
        }, 1000);
      }

      // Cache the new state and log if appropriate
      [this.cacheR, this.cacheG, this.cacheB] = rgb;
      this.cacheMired = value;
      this.cacheScene = '';
      if (this.cacheKelvin !== k) {
        this.cacheKelvin = k;
        if (this.alController?.isAdaptiveLightingActive?.()) {
          this.accessory.log(`${platformLang.curColour} [${k}K / ${value}M] ${platformLang.viaAL}`);
        } else {
          this.accessory.log(`${platformLang.curColour} [${k}K / ${value}M]`);
        }
      }
    } catch (err) {
      this.handleUpdateError(
        err,
        this._service.getCharacteristic(this.hapChar.ColorTemperature),
        this.cacheMired,
      );
    }
  }

  private async internalSceneUpdate(
    charName: SceneCharName,
    awsCode: string,
    bleCode: string | undefined,
    value: boolean,
    isService = false,
  ): Promise<void> {
    try {
      // Don't continue if command is to turn off
      if (!value) {
        return;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'rgbScene',
        value: [awsCode, bleCode],
      });

      // Disable adaptive lighting if it's on already
      if (!this.colourSafeMode && this.alController?.isAdaptiveLightingActive?.()) {
        this.alController.disableAdaptiveLighting();
        this.accessory.log(platformLang.alDisabledScene);
      }

      // Log the scene change
      if (this.cacheScene !== charName) {
        this.cacheScene = charName;
        this.accessory.log(`${platformLang.curScene} [${this.cacheScene}]`);
      }

      // Turn all the characteristics off and turn the on switch to on
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.On, true);
        if (this.cusChar.ColourMode) {
          this._service.updateCharacteristic(this.cusChar.ColourMode, false);
        }
        this.usedCodes.forEach((thisCharName) => {
          if (thisCharName !== charName) {
            if (this.cusChar[thisCharName] && this._service.testCharacteristic(this.cusChar[thisCharName])) {
              this._service.updateCharacteristic(this.cusChar[thisCharName], false);
            }
            const sceneSwitch = this.accessory.getService(thisCharName);
            if (sceneSwitch) {
              sceneSwitch.updateCharacteristic(this.hapChar.On, false);
            }
          }
        });
      }, 1000);
    } catch (err) {
      // For scene updates, we need custom revert logic based on whether it's a service or characteristic
      if (isService) {
        const sceneService = this.accessory.getService(charName);
        if (sceneService) {
          this.handleUpdateError(err, sceneService.getCharacteristic(this.hapChar.On), false);
        } else {
          this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
        }
      } else if (this.cusChar[charName]) {
        this.handleUpdateError(err, this._service.getCharacteristic(this.cusChar[charName]), false);
      } else {
        this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      }
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    // Return if not initialised
    if (!this.initialised) {
      return;
    }

    // Check to see if the provided state is different from the cached value
    if (params.state && params.state !== this.cacheState) {
      // State is different so update Homebridge with new values
      this.cacheState = params.state;
      this._service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');

      // Log the change
      this.accessory.log(`${platformLang.curState} [${this.cacheState}]`);
    }

    // Check to see if the provided brightness is different from the cached value
    if (hasProperty(params, 'brightness') && params.brightness !== this.cacheBrightRaw) {
      // Brightness is different so update Homebridge with new values
      this.cacheBrightRaw = params.brightness!;

      // Govee considers brightness 0 as OFF so change brightness to 1 if light is on
      this.cacheBright = this.cacheState === 'on' ? Math.max(this.cacheBrightRaw, 1) : this.cacheBrightRaw;
      this._service.updateCharacteristic(this.hapChar.Brightness, this.cacheBright);

      // Log the change
      this.accessory.log(`${platformLang.curBright} [${this.cacheBright}%]`);
    }

    // Check to see if the provided colour is different from the cached state
    if (params.kelvin || params.rgb) {
      this.handleExternalColourUpdate(params);
    }
  }

  private handleExternalColourUpdate(params: ExternalUpdateParams): void {
    // Colour can be provided in rgb or kelvin so either way convert to hs for later
    let hs: [number, number];
    let rgb: [number, number, number];
    let mired: number | undefined;
    let colourChange = false;
    let sigColourChange = false;

    if (params.kelvin) {
      mired = Math.round(1000000 / params.kelvin);
      hs = m2hs(mired);
      rgb = hs2rgb(hs[0], hs[1]);

      // Check for a colour change
      if (params.kelvin !== this.cacheKelvin) {
        colourChange = true;

        // Check for a significant colour change
        const kelvinDiff = Math.abs(params.kelvin - this.cacheKelvin);
        if (kelvinDiff > 100) {
          sigColourChange = true;
        }
      }
    } else if (params.rgb) {
      rgb = [params.rgb.r, params.rgb.g, params.rgb.b];
      hs = rgb2hs(rgb[0], rgb[1], rgb[2]);

      // Check for a colour change
      if (hs[0] !== this.cacheHue) {
        colourChange = true;

        // Check for a significant colour change
        const rgbDiff = Math.abs(rgb[0] - this.cacheR) +
          Math.abs(rgb[1] - this.cacheG) +
          Math.abs(rgb[2] - this.cacheB);
        if (rgbDiff > 50) {
          sigColourChange = true;
        }
      }
    } else {
      return;
    }

    // Perform the check against the cache
    if (colourChange) {
      // Colour is different so update Homebridge with new values
      this._service.updateCharacteristic(this.hapChar.Hue, hs[0]);
      this._service.updateCharacteristic(this.hapChar.Saturation, hs[1]);
      [this.cacheR, this.cacheG, this.cacheB] = rgb;
      [this.cacheHue] = hs;

      if (mired !== undefined && params.kelvin) {
        if (!this.colourSafeMode) {
          this._service.updateCharacteristic(this.hapChar.ColorTemperature, mired);
        }
        this.cacheMired = mired;
        this.cacheKelvin = params.kelvin;
        this.accessory.log(`${platformLang.curColour} [${params.kelvin}K / ${mired}M]`);
      } else {
        this.accessory.log(`${platformLang.curColour} [rgb ${this.cacheR} ${this.cacheG} ${this.cacheB}]`);
      }

      // If the difference is significant then disable adaptive lighting
      if (!this.colourSafeMode && this.alController?.isAdaptiveLightingActive?.() && sigColourChange) {
        this.alController.disableAdaptiveLighting();
        this.accessory.log(platformLang.alDisabled);
      }
    }
  }
}

export default LightDevice;
