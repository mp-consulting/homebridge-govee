/**
 * Service Factory
 *
 * Helper functions for creating and configuring HomeKit services
 * with reduced boilerplate code.
 */

import type { API, Characteristic, CharacteristicValue, Service } from 'homebridge';
import type { GoveePlatformAccessoryWithControl, GoveePlatform } from '../types.js';

// HAP types
type HapCharacteristic = API['hap']['Characteristic'];
type HapService = API['hap']['Service'];

/**
 * Service factory context
 */
export interface ServiceFactoryContext {
  platform: GoveePlatform;
  accessory: GoveePlatformAccessoryWithControl;
  hapChar: HapCharacteristic;
  hapServ: HapService;
}

/**
 * Speed control configuration
 */
export interface SpeedControlConfig {
  maxSpeed: number;
  stepSize: number;
  validValues: number[];
  onSet: (value: number) => Promise<void>;
}

/**
 * On/Off control configuration
 */
export interface OnOffConfig {
  activeCharacteristic?: boolean; // Use Active (1/0) instead of On (boolean)
  onSet: (value: number | boolean) => Promise<void>;
}

/**
 * Lock control configuration
 */
export interface LockConfig {
  onSet: (value: number) => Promise<void>;
}

/**
 * Night light configuration
 */
export interface NightLightConfig {
  characteristicClass?: Characteristic;
  onSet?: (value: boolean) => Promise<void>;
}

/**
 * Display light configuration
 */
export interface DisplayLightConfig {
  characteristicClass?: Characteristic;
  onSet?: (value: boolean) => Promise<void>;
}

/**
 * Create an Air Purifier service with common configuration
 */
export function createAirPurifierService(
  ctx: ServiceFactoryContext,
  config: {
    onOff: OnOffConfig;
    speed?: SpeedControlConfig;
    lock?: LockConfig;
    manualOnly?: boolean;
  },
): Service {
  const { accessory, hapServ, hapChar } = ctx;

  // Get or create service
  let service = accessory.getService(hapServ.AirPurifier);
  if (!service) {
    service = accessory.addService(hapServ.AirPurifier);
  }

  // Active characteristic (on/off)
  service.getCharacteristic(hapChar.Active).onSet(async (value) => {
    await config.onOff.onSet(value as number);
  });

  // Target state - manual only by default
  if (config.manualOnly !== false) {
    service
      .getCharacteristic(hapChar.TargetAirPurifierState)
      .updateValue(1)
      .setProps({ minValue: 1, maxValue: 1, validValues: [1] });
  }

  // Speed control
  if (config.speed) {
    service
      .getCharacteristic(hapChar.RotationSpeed)
      .setProps({
        minStep: config.speed.stepSize,
        validValues: config.speed.validValues,
      })
      .onSet(async (value) => {
        await config.speed!.onSet(value as number);
      });
  }

  // Lock controls
  if (config.lock) {
    service.getCharacteristic(hapChar.LockPhysicalControls).onSet(async (value) => {
      await config.lock!.onSet(value as number);
    });
  }

  return service;
}

/**
 * Create a Fan service with common configuration
 */
export function createFanService(
  ctx: ServiceFactoryContext,
  config: {
    onOff: OnOffConfig;
    speed?: SpeedControlConfig;
  },
): Service {
  const { accessory, hapServ, hapChar } = ctx;

  // Get or create service
  let service = accessory.getService(hapServ.Fan);
  if (!service) {
    service = accessory.addService(hapServ.Fan);
  }

  // On characteristic
  service.getCharacteristic(hapChar.On).onSet(async (value) => {
    await config.onOff.onSet(value as boolean);
  });

  // Speed control
  if (config.speed) {
    service
      .getCharacteristic(hapChar.RotationSpeed)
      .setProps({
        minStep: config.speed.stepSize,
        validValues: config.speed.validValues,
      })
      .onSet(async (value) => {
        await config.speed!.onSet(value as number);
      });
  }

  return service;
}

/**
 * Create a Lightbulb service with common configuration
 */
export function createLightbulbService(
  ctx: ServiceFactoryContext,
  config: {
    name?: string;
    onSet: (value: boolean) => Promise<void>;
    brightness?: {
      onSet: (value: number) => Promise<void>;
    };
    color?: {
      onSetHue: (value: number) => Promise<void>;
    };
  },
): Service {
  const { accessory, hapServ, hapChar } = ctx;

  // Get or create service
  let service = accessory.getService(hapServ.Lightbulb);
  if (!service) {
    service = accessory.addService(hapServ.Lightbulb);
  }

  // Set subtype/name if provided
  if (config.name) {
    service.setCharacteristic(hapChar.Name, config.name);
  }

  // On characteristic
  service.getCharacteristic(hapChar.On).onSet(async (value) => {
    await config.onSet(value as boolean);
  });

  // Brightness
  if (config.brightness) {
    service.getCharacteristic(hapChar.Brightness).onSet(async (value) => {
      await config.brightness!.onSet(value as number);
    });
  }

  // Color (Hue)
  if (config.color) {
    service.getCharacteristic(hapChar.Hue).onSet(async (value) => {
      await config.color!.onSetHue(value as number);
    });
  }

  return service;
}

/**
 * Create an Air Quality Sensor service
 */
export function createAirQualitySensorService(
  ctx: ServiceFactoryContext,
  config?: {
    includePM25?: boolean;
  },
): Service {
  const { accessory, hapServ, hapChar } = ctx;

  // Get or create service
  let service = accessory.getService(hapServ.AirQualitySensor);
  if (!service) {
    service = accessory.addService(hapServ.AirQualitySensor);
  }

  // Add PM2.5 Density if requested
  if (config?.includePM25) {
    if (!service.testCharacteristic(hapChar.PM2_5Density)) {
      service.addCharacteristic(hapChar.PM2_5Density);
    }
  }

  return service;
}

/**
 * Create a Humidity Sensor service
 */
export function createHumiditySensorService(ctx: ServiceFactoryContext): Service {
  const { accessory, hapServ } = ctx;

  // Get or create service
  let service = accessory.getService(hapServ.HumiditySensor);
  if (!service) {
    service = accessory.addService(hapServ.HumiditySensor);
  }

  return service;
}

/**
 * Add a custom characteristic to a service
 */
export function addCustomCharacteristic(
  ctx: ServiceFactoryContext,
  service: Service,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  characteristicClass: any,
  onSet?: (value: CharacteristicValue) => Promise<void>,
): Characteristic | undefined {
  if (!characteristicClass) {
    return undefined;
  }

  if (!service.testCharacteristic(characteristicClass)) {
    service.addCharacteristic(characteristicClass);
  }

  const characteristic = service.getCharacteristic(characteristicClass);
  if (onSet) {
    characteristic.onSet(onSet);
  }

  return characteristic;
}

/**
 * Update air purifier state (Active + CurrentAirPurifierState)
 */
export function updateAirPurifierState(
  service: Service,
  hapChar: HapCharacteristic,
  isOn: boolean,
): void {
  service.updateCharacteristic(hapChar.Active, isOn ? 1 : 0);
  service.updateCharacteristic(hapChar.CurrentAirPurifierState, isOn ? 2 : 0);
}

/**
 * Get valid values array for speed control
 */
export function getSpeedValidValues(maxSpeed: number): number[] {
  const values = [0];
  for (let i = 1; i <= maxSpeed; i++) {
    values.push(Math.round((i / maxSpeed) * 100));
  }
  return values;
}

/**
 * Calculate step size from max speed
 */
export function getSpeedStepSize(maxSpeed: number): number {
  return Math.round(100 / maxSpeed);
}

export default {
  createAirPurifierService,
  createFanService,
  createLightbulbService,
  createAirQualitySensorService,
  createHumiditySensorService,
  addCustomCharacteristic,
  updateAirPurifierState,
  getSpeedValidValues,
  getSpeedStepSize,
};
