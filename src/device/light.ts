import type { Service, AdaptiveLightingController } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type {
  GoveePlatformAccessoryWithControl,
  ExternalUpdateParams,
  LightDeviceConfig,
  MusicModeConfig,
  SceneSelection,
} from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { hs2rgb, k2rgb, m2hs, rgb2hs } from '../utils/colour.js';
import { platformConsts, platformLang } from '../utils/index.js';
import { createDebouncedGuard, hasProperty, parseError, sleep } from '../utils/functions.js';
import type { MusicEffect } from '../utils/scene-codes.js';

/**
 * The original fixed scene slots. Each maps to a custom Eve characteristic, so the
 * list cannot grow — which is why scenes picked from the Govee library live in the
 * `scenes` array instead. These are still read so existing configs keep working.
 */
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

/** Subtype prefix for the switch services backing library-picked scenes. */
const SCENE_SERVICE_PREFIX = 'gv-scene-';

/** Subtype for the live music-mode service. */
const MUSIC_SERVICE_SUBTYPE = 'gv-music';

/**
 * A scene the accessory can apply, whether it came from the new `scenes` array or one
 * of the legacy fixed slots.
 */
interface ActiveScene {
  /** Unique key: the legacy characteristic name, or a `gv-scene-*` service subtype. */
  key: string;
  name: string;
  sceneCode: string;
  bleCode?: string;
  /** Set when the scene is driven by a legacy Eve characteristic rather than a switch. */
  legacyChar?: SceneCharName;
}

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
  private scenes: ActiveScene[] = [];
  private hasScenes = false;

  // Live music mode
  private musicService?: Service;
  private musicConf?: MusicModeConfig;
  private cacheMusicSensitivity = 50;
  private cacheMusicHue = 0;
  private cacheMusicSat = 0;

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

  // Debounce guards
  private debounceBright = createDebouncedGuard(350);
  private debounceColour = createDebouncedGuard(300);
  private debounceCT = createDebouncedGuard(300);

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
    // Remove the legacy subtype-less switch service if it exists
    this.removeLegacySwitchService();

    // If adaptive lighting has just been disabled then the service has to be re-added
    // from scratch to hide the AL icon
    const replaceMain = (this.colourSafeMode || this.alShift === -1)
      && !!this.accessory.context.adaptiveLighting;
    this._service = this.ensureMainLightbulb(replaceMain);
    if (replaceMain) {
      this.accessory.context.adaptiveLighting = false;
    }

    // Setup custom characteristics for different scenes and modes
    this.setupSceneCharacteristics();

    // Expose live music mode as its own service when enabled
    this.setupMusicMode();

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

  /**
   * Drop the legacy subtype-less Switch service. This cannot go through
   * `removeServiceIfExists`, which matches on UUID alone and so would delete the first
   * `gv-scene-*` tile instead — re-adding it later shifts its instance id and breaks the
   * name, room and automations the user bound to it.
   */
  private removeLegacySwitchService(): void {
    const legacy = this.accessory.services.find(
      (service) => service.UUID === this.hapServ.Switch.UUID && !service.subtype,
    );
    if (legacy) {
      this.accessory.removeService(legacy);
    }
  }

  /**
   * Get the main lightbulb service, adding it if needed.
   *
   * Both this service and the music tile are Lightbulbs, and `getService()` matches on
   * UUID alone, so the main service is identified by having no subtype. hap-nodejs also
   * refuses to add a second subtype-less service of a UUID that is already present, so
   * any other Lightbulb has to stand aside whenever this one is added — `setupMusicMode`
   * recreates the music tile immediately afterwards.
   */
  private ensureMainLightbulb(replace: boolean): Service {
    const existing = this.accessory.services.find(
      (service) => service.UUID === this.hapServ.Lightbulb.UUID && !service.subtype,
    );
    if (existing && !replace) {
      return existing;
    }
    for (const service of [...this.accessory.services]) {
      if (service.UUID === this.hapServ.Lightbulb.UUID) {
        this.accessory.removeService(service);
      }
    }
    return this.accessory.addService(this.hapServ.Lightbulb);
  }

  private setupSceneCharacteristics(): void {
    this.scenes = [];

    this.setupLegacySceneSlots();
    this.setupLibraryScenes();
    this.pruneStaleSceneServices();

    this.hasScenes = this.scenes.length > 0;
  }

  /**
   * Wire up the original fixed slots (`scene`, `diyMode`, `musicMode`, …), each of
   * which is a hand-pasted code bound to a custom Eve characteristic or a switch.
   */
  private setupLegacySceneSlots(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deviceConf = this.deviceConf as any;

    for (const charName of SCENE_CHAR_NAMES) {
      const confName = charName.charAt(0).toLowerCase() + charName.slice(1);
      const confCode = deviceConf[confName] as { sceneCode?: string; bleCode?: string; showAs?: string } | undefined;

      if (!confCode?.sceneCode) {
        // Remove the characteristic if the slot is no longer configured
        if (this.cusChar[charName] && this._service.testCharacteristic(this.cusChar[charName])) {
          this._service.removeCharacteristic(this._service.getCharacteristic(this.cusChar[charName]));
        }
        continue;
      }

      const { bleCode, sceneCode } = confCode;
      const asSwitch = confCode.showAs === 'switch';
      const scene: ActiveScene = {
        key: charName,
        name: charName,
        sceneCode,
        bleCode,
        legacyChar: asSwitch ? undefined : charName,
      };
      this.scenes.push(scene);

      if (asSwitch) {
        this.setupSceneAsSwitch(scene, charName);
      } else {
        this.setupSceneAsEve(scene, charName);
      }
    }
  }

  /**
   * Wire up scenes picked from the Govee scene library. These are unbounded in number,
   * so each gets its own switch service rather than a custom characteristic.
   */
  private setupLibraryScenes(): void {
    const deviceConf = this.deviceConf as unknown as Partial<LightDeviceConfig>;
    const selections = Array.isArray(deviceConf.scenes) ? deviceConf.scenes : [];

    selections.forEach((selection: SceneSelection, index: number) => {
      if (!selection?.sceneCode || !selection.name) {
        return;
      }
      // Scene ids and DIY ids are numbered independently, so the kind has to be part of
      // the key or a scene and a DIY effect sharing an id collapse into one tile
      const kind = selection.kind ?? 'scene';
      const scene: ActiveScene = {
        key: `${SCENE_SERVICE_PREFIX}${kind}-${selection.sceneId ?? index}`,
        name: selection.name,
        sceneCode: selection.sceneCode,
        bleCode: selection.bleCode,
      };
      this.scenes.push(scene);
      this.setupSceneAsSwitch(scene, scene.key);
    });
  }

  /**
   * Drop switch services for scenes the user has since removed from the config.
   * Without this they would linger in HomeKit as dead tiles.
   */
  private pruneStaleSceneServices(): void {
    const liveKeys = new Set(this.scenes.map((scene) => scene.key));
    for (const service of [...this.accessory.services]) {
      const subtype = service.subtype;
      if (!subtype) {
        continue;
      }
      const isSceneService = subtype.startsWith(SCENE_SERVICE_PREFIX)
        || (SCENE_CHAR_NAMES as readonly string[]).includes(subtype);
      if (isSceneService && !liveKeys.has(subtype)) {
        this.accessory.removeService(service);
      }
    }
  }

  private setupSceneAsSwitch(scene: ActiveScene, subtype: string): void {
    // A switch and an Eve characteristic are mutually exclusive representations
    const charName = scene.legacyChar ?? (subtype as SceneCharName);
    if (this.cusChar[charName] && this._service.testCharacteristic(this.cusChar[charName])) {
      this._service.removeCharacteristic(this._service.getCharacteristic(this.cusChar[charName]));
    }

    let switchService = this.accessory.getServiceById(this.hapServ.Switch, subtype);
    if (!switchService) {
      switchService = this.accessory.addService(this.hapServ.Switch, scene.name, subtype);
    }

    // Keep the tile name in step with a renamed scene
    if (!switchService.testCharacteristic(this.hapChar.ConfiguredName)) {
      switchService.addCharacteristic(this.hapChar.ConfiguredName);
    }
    switchService.updateCharacteristic(this.hapChar.ConfiguredName, scene.name);
    switchService.updateCharacteristic(this.hapChar.Name, scene.name);

    switchService
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => {
        await this.internalSceneUpdate(scene, value as boolean, true);
      })
      .updateValue(false);
  }

  private setupSceneAsEve(scene: ActiveScene, charName: SceneCharName): void {
    // Remove the accessory service switch if exists
    const existingSwitch = this.accessory.getServiceById(this.hapServ.Switch, charName);
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
          await this.internalSceneUpdate(scene, value as boolean, false);
        })
        .updateValue(false);
    }
  }

  /**
   * Live music mode, exposed as its own lightbulb service so that sensitivity and
   * colour are adjustable from HomeKit instead of frozen into a pasted code:
   * On toggles music mode, Brightness is the microphone sensitivity, and Hue and
   * Saturation set the colour used when auto-colour is off.
   */
  private setupMusicMode(): void {
    const deviceConf = this.deviceConf as unknown as Partial<LightDeviceConfig>;
    this.musicConf = deviceConf.musicModeLive;

    const existing = this.accessory.getServiceById(this.hapServ.Lightbulb, MUSIC_SERVICE_SUBTYPE);

    if (!this.musicConf?.enabled) {
      if (existing) {
        this.accessory.removeService(existing);
      }
      this.musicService = undefined;
      return;
    }

    this.musicService = existing
      || this.accessory.addService(this.hapServ.Lightbulb, platformLang.musicModeName, MUSIC_SERVICE_SUBTYPE);

    this.cacheMusicSensitivity = this.musicConf.sensitivity ?? 50;

    this.musicService
      .getCharacteristic(this.hapChar.On)
      .onSet(async (value) => {
        if (value) {
          await this.internalMusicUpdate();
        }
      })
      .updateValue(false);

    this.musicService
      .getCharacteristic(this.hapChar.Brightness)
      .onSet(async (value) => {
        this.cacheMusicSensitivity = value as number;
        // Only re-send while music mode is the active mode
        if (this.musicService?.getCharacteristic(this.hapChar.On).value) {
          await this.internalMusicUpdate();
        }
      })
      .updateValue(this.cacheMusicSensitivity);

    // Colour is only meaningful when the device is not picking colours itself.
    // Auto colour is the default, matching `internalMusicUpdate` and the config schema.
    if (this.musicConf.autoColour ?? true) {
      for (const char of [this.hapChar.Hue, this.hapChar.Saturation]) {
        if (this.musicService.testCharacteristic(char)) {
          this.musicService.removeCharacteristic(this.musicService.getCharacteristic(char));
        }
      }
    } else {
      this.musicService.getCharacteristic(this.hapChar.Hue).onSet(async (value) => {
        this.cacheMusicHue = value as number;
        if (this.musicService?.getCharacteristic(this.hapChar.On).value) {
          await this.internalMusicUpdate();
        }
      });
      this.musicService.getCharacteristic(this.hapChar.Saturation).onSet(async (value) => {
        this.cacheMusicSat = value as number;
        if (this.musicService?.getCharacteristic(this.hapChar.On).value) {
          await this.internalMusicUpdate();
        }
      });
      this.cacheMusicHue = this.musicService.getCharacteristic(this.hapChar.Hue).value as number;
      this.cacheMusicSat = this.musicService.getCharacteristic(this.hapChar.Saturation).value as number;
    }
  }

  private async internalMusicUpdate(): Promise<void> {
    if (!this.musicConf?.enabled) {
      return;
    }
    try {
      const autoColour = this.musicConf.autoColour ?? true;
      const [r, g, b] = hs2rgb(this.cacheMusicHue, this.cacheMusicSat);

      await this.sendDeviceUpdate({
        cmd: 'musicMode',
        value: {
          effect: (this.musicConf.effect ?? 'rhythm') as MusicEffect,
          sensitivity: this.cacheMusicSensitivity,
          autoColour,
          soft: this.musicConf.soft ?? false,
          colour: autoColour ? undefined : { r, g, b },
          protocol: this.musicConf.protocol ?? 'modern',
        },
      });

      if (!this.colourSafeMode && this.alController?.isAdaptiveLightingActive?.()) {
        this.alController.disableAdaptiveLighting();
        this.accessory.log(platformLang.alDisabledScene);
      }

      this.accessory.log(
        `${platformLang.curMusicMode} [${this.musicConf.effect ?? 'rhythm'}] [${this.cacheMusicSensitivity}%]`,
      );

      // Music mode replaces whatever mode was active
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.On, true);
        if (this.cusChar.ColourMode) {
          this._service.updateCharacteristic(this.cusChar.ColourMode, false);
        }
        // Music mode is the active mode, so its own tile has to stay on
        this.resetSceneIndicators(MUSIC_SERVICE_SUBTYPE);
      }, 1000);
    } catch (err) {
      if (this.musicService) {
        this.handleUpdateError(err, this.musicService.getCharacteristic(this.hapChar.On), false);
      } else {
        this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
      }
    }
  }

  /**
   * Clear every scene indicator, optionally leaving one on. Used whenever the active
   * mode changes so HomeKit does not show two modes active at once.
   */
  private resetSceneIndicators(exceptKey?: string): void {
    for (const scene of this.scenes) {
      if (scene.key === exceptKey) {
        continue;
      }
      if (scene.legacyChar && this.cusChar[scene.legacyChar] && this._service.testCharacteristic(this.cusChar[scene.legacyChar])) {
        this._service.updateCharacteristic(this.cusChar[scene.legacyChar], false);
      }
      const sceneSwitch = this.accessory.getServiceById(this.hapServ.Switch, scene.key);
      if (sceneSwitch) {
        sceneSwitch.updateCharacteristic(this.hapChar.On, false);
      }
    }
    if (exceptKey !== MUSIC_SERVICE_SUBTYPE) {
      this.musicService?.updateCharacteristic(this.hapChar.On, false);
    }
  }

  private setupColourModeCharacteristic(): void {
    // Music mode counts too: it is another mode the colour toggle has to switch away
    // from, and without this the characteristic would be missing when music is the
    // only extra mode configured.
    if (this.hasScenes || this.musicService) {
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
      // Debounce when endlessly sliding the brightness scale
      if (!await this.debounceBright()) {
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
      // Debounce when endlessly sliding the colour wheel
      if (!await this.debounceColour()) {
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

      // Switch off any custom mode/scene indicators and turn the on switch to on
      if (this.hasScenes || this.musicService) {
        setTimeout(() => {
          this._service.updateCharacteristic(this.hapChar.On, true);
          if (this.cusChar.ColourMode) {
            this._service.updateCharacteristic(this.cusChar.ColourMode, true);
          }
          this.resetSceneIndicators();
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
      // Debounce when endlessly sliding the colour temperature
      if (!await this.debounceCT()) {
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

      // Switch off any custom mode/scene indicators and turn the on switch to on
      if (this.hasScenes || this.musicService) {
        setTimeout(() => {
          this._service.updateCharacteristic(this.hapChar.On, true);
          if (this.cusChar.ColourMode) {
            this._service.updateCharacteristic(this.cusChar.ColourMode, true);
          }
          this.resetSceneIndicators();
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

  private async internalSceneUpdate(scene: ActiveScene, value: boolean, isService = false): Promise<void> {
    try {
      // Don't continue if command is to turn off
      if (!value) {
        return;
      }

      // Send the request to the platform sender function
      await this.sendDeviceUpdate({
        cmd: 'rgbScene',
        value: [scene.sceneCode, scene.bleCode],
      });

      // Disable adaptive lighting if it's on already
      if (!this.colourSafeMode && this.alController?.isAdaptiveLightingActive?.()) {
        this.alController.disableAdaptiveLighting();
        this.accessory.log(platformLang.alDisabledScene);
      }

      // Log the scene change
      if (this.cacheScene !== scene.name) {
        this.cacheScene = scene.name;
        this.accessory.log(`${platformLang.curScene} [${this.cacheScene}]`);
      }

      // Turn all other mode indicators off and turn the on switch to on
      setTimeout(() => {
        this._service.updateCharacteristic(this.hapChar.On, true);
        if (this.cusChar.ColourMode) {
          this._service.updateCharacteristic(this.cusChar.ColourMode, false);
        }
        this.resetSceneIndicators(scene.key);
      }, 1000);
    } catch (err) {
      // For scene updates, we need custom revert logic based on whether it's a service or characteristic
      if (isService) {
        const sceneService = this.accessory.getServiceById(this.hapServ.Switch, scene.key);
        if (sceneService) {
          this.handleUpdateError(err, sceneService.getCharacteristic(this.hapChar.On), false);
        } else {
          this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);
        }
      } else if (scene.legacyChar && this.cusChar[scene.legacyChar]) {
        this.handleUpdateError(err, this._service.getCharacteristic(this.cusChar[scene.legacyChar]), false);
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
