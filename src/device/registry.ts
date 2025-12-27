import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl } from '../types.js';
import type { GoveeDeviceBase } from './base.js';
import { platformConsts } from '../utils/index.js';

// Device handler type
export type DeviceHandlerClass = new (
  platform: GoveePlatform,
  accessory: GoveePlatformAccessoryWithControl
) => GoveeDeviceBase;

// Device category types
export type DeviceCategory =
  | 'light'
  | 'lightSwitch'
  | 'outletSingle'
  | 'outletDouble'
  | 'outletTriple'
  | 'switchSingle'
  | 'switchDouble'
  | 'switchTriple'
  | 'fan'
  | 'heater'
  | 'heater1a'
  | 'heater1b'
  | 'heater2'
  | 'cooler'
  | 'humidifier'
  | 'dehumidifier'
  | 'purifier'
  | 'diffuser'
  | 'kettle'
  | 'iceMaker'
  | 'sensorThermo'
  | 'sensorLeak'
  | 'sensorContact'
  | 'sensorPresence'
  | 'sensorButton'
  | 'sensorMonitor'
  | 'tap'
  | 'valve'
  | 'tv'
  | 'template';

// Registry of device handlers by category
const deviceHandlers = new Map<DeviceCategory, DeviceHandlerClass>();

// Model to category mapping (populated from constants)
const modelCategoryMap = new Map<string, DeviceCategory>();

/**
 * Register a device handler class for a category
 */
export function registerDeviceHandler(
  category: DeviceCategory,
  handler: DeviceHandlerClass,
): void {
  deviceHandlers.set(category, handler);
}

/**
 * Register model numbers for a category
 */
export function registerModelsForCategory(
  category: DeviceCategory,
  models: readonly string[],
): void {
  for (const model of models) {
    modelCategoryMap.set(model.toUpperCase(), category);
  }
}

/**
 * Get the device category for a model number
 */
export function getCategoryForModel(model: string): DeviceCategory | undefined {
  return modelCategoryMap.get(model.toUpperCase());
}

/**
 * Get the device handler class for a category
 */
export function getDeviceHandler(category: DeviceCategory): DeviceHandlerClass | undefined {
  return deviceHandlers.get(category);
}

/**
 * Get the device handler class for a model number
 */
export function getDeviceHandlerForModel(model: string): DeviceHandlerClass | undefined {
  const category = getCategoryForModel(model);
  if (category) {
    return getDeviceHandler(category);
  }
  return undefined;
}

/**
 * Create a device instance for the given model
 */
export function createDeviceInstance(
  model: string,
  platform: GoveePlatform,
  accessory: GoveePlatformAccessoryWithControl,
): GoveeDeviceBase | undefined {
  const Handler = getDeviceHandlerForModel(model);
  if (Handler) {
    const instance = new Handler(platform, accessory);
    instance.init();
    return instance;
  }
  return undefined;
}

/**
 * Initialize the model to category mappings from constants
 */
export function initializeModelMappings(): void {
  // RGB Lights
  registerModelsForCategory('light', platformConsts.models.rgb);

  // Switches (outlets) - single, double, triple
  registerModelsForCategory('switchSingle', platformConsts.models.switchSingle);
  registerModelsForCategory('switchDouble', platformConsts.models.switchDouble);
  registerModelsForCategory('switchTriple', platformConsts.models.switchTriple);

  // Fans
  registerModelsForCategory('fan', platformConsts.models.fan);

  // Heaters
  registerModelsForCategory('heater', platformConsts.models.heater1);
  registerModelsForCategory('heater', platformConsts.models.heater2);

  // Humidifiers
  registerModelsForCategory('humidifier', platformConsts.models.humidifier);

  // Dehumidifiers
  registerModelsForCategory('dehumidifier', platformConsts.models.dehumidifier);

  // Purifiers
  registerModelsForCategory('purifier', platformConsts.models.purifier);

  // Diffusers
  registerModelsForCategory('diffuser', platformConsts.models.diffuser);

  // Kettles
  registerModelsForCategory('kettle', platformConsts.models.kettle);

  // Ice Makers
  registerModelsForCategory('iceMaker', platformConsts.models.iceMaker);

  // Sensors
  registerModelsForCategory('sensorThermo', platformConsts.models.sensorThermo);
  registerModelsForCategory('sensorThermo', platformConsts.models.sensorThermo4);
  registerModelsForCategory('sensorLeak', platformConsts.models.sensorLeak);
  registerModelsForCategory('sensorButton', platformConsts.models.sensorButton);
  registerModelsForCategory('sensorContact', platformConsts.models.sensorContact);
  registerModelsForCategory('sensorPresence', platformConsts.models.sensorPresence);
  registerModelsForCategory('sensorMonitor', platformConsts.models.sensorMonitor);

  // Template devices (for future expansion)
  registerModelsForCategory('template', platformConsts.models.template);
}

/**
 * Get all registered categories
 */
export function getRegisteredCategories(): DeviceCategory[] {
  return Array.from(deviceHandlers.keys());
}

/**
 * Check if a model is supported
 */
export function isModelSupported(model: string): boolean {
  return modelCategoryMap.has(model.toUpperCase());
}

export default {
  registerDeviceHandler,
  registerModelsForCategory,
  getCategoryForModel,
  getDeviceHandler,
  getDeviceHandlerForModel,
  createDeviceInstance,
  initializeModelMappings,
  getRegisteredCategories,
  isModelSupported,
};
