import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessory } from '../types.js';
import type { GoveeDeviceBase } from './base.js';
import { platformConsts } from '../utils/index.js';

// Device handler type
export type DeviceHandlerClass = new (
  platform: GoveePlatform,
  accessory: GoveePlatformAccessory
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
  handler: DeviceHandlerClass
): void {
  deviceHandlers.set(category, handler);
}

/**
 * Register model numbers for a category
 */
export function registerModelsForCategory(
  category: DeviceCategory,
  models: readonly string[]
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
  accessory: GoveePlatformAccessory
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
  // RGB Lights - all categories of lights map to 'light'
  registerModelsForCategory('light', platformConsts.models.rgb);
  registerModelsForCategory('light', platformConsts.models.rgbTwo);
  registerModelsForCategory('light', platformConsts.models.rgb1a);
  registerModelsForCategory('light', platformConsts.models.rgb2);
  registerModelsForCategory('light', platformConsts.models.rgbNoScale);
  registerModelsForCategory('light', platformConsts.models.motion);
  registerModelsForCategory('light', platformConsts.models.adaptiveLighting);

  // Light switch
  registerModelsForCategory('lightSwitch', platformConsts.models.lightSwitch);

  // Outlets
  registerModelsForCategory('outletSingle', platformConsts.models.singleSwitch);
  registerModelsForCategory('outletDouble', platformConsts.models.doubleSwitch);

  // Switches (as identified in constants)
  registerModelsForCategory('switchSingle', platformConsts.models.singleSwitchOutlet);
  registerModelsForCategory('switchDouble', platformConsts.models.doubleSwitchOutlet);
  registerModelsForCategory('switchTriple', platformConsts.models.tripleSwitchOutlet);
  registerModelsForCategory('switchSingle', platformConsts.models.switchSingle);
  registerModelsForCategory('switchDouble', platformConsts.models.switchDouble);
  registerModelsForCategory('switchTriple', platformConsts.models.switchTriple);

  // Fans - different models have different handlers
  // H7100
  for (const model of platformConsts.models.fanH7100 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'fan');
  }
  // H7101
  for (const model of platformConsts.models.fanH7101 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'fan');
  }
  // H7102
  for (const model of platformConsts.models.fanH7102 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'fan');
  }
  // H7105
  for (const model of platformConsts.models.fanH7105 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'fan');
  }
  // H7106
  for (const model of platformConsts.models.fanH7106 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'fan');
  }
  // H7107
  for (const model of platformConsts.models.fanH7107 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'fan');
  }
  // H7111
  for (const model of platformConsts.models.fanH7111 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'fan');
  }

  // Heaters
  registerModelsForCategory('heater', platformConsts.models.heaterSingle);
  registerModelsForCategory('heater', platformConsts.models.heater1a);
  registerModelsForCategory('heater', platformConsts.models.heater1b);
  registerModelsForCategory('heater', platformConsts.models.heater2);

  // Coolers
  registerModelsForCategory('cooler', platformConsts.models.cooler);

  // Humidifiers - different models have different handlers
  for (const model of platformConsts.models.humidifierH7140 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'humidifier');
  }
  for (const model of platformConsts.models.humidifierH7141 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'humidifier');
  }
  for (const model of platformConsts.models.humidifierH7142 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'humidifier');
  }
  for (const model of platformConsts.models.humidifierH7143 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'humidifier');
  }
  for (const model of platformConsts.models.humidifierH7145 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'humidifier');
  }
  for (const model of platformConsts.models.humidifierH7147 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'humidifier');
  }
  for (const model of platformConsts.models.humidifierH7148 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'humidifier');
  }
  for (const model of platformConsts.models.humidifierH7160 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'humidifier');
  }
  for (const model of platformConsts.models.humidifierH714E || []) {
    modelCategoryMap.set(model.toUpperCase(), 'humidifier');
  }

  // Dehumidifiers
  for (const model of platformConsts.models.dehumidifierH7150 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'dehumidifier');
  }
  for (const model of platformConsts.models.dehumidifierH7151 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'dehumidifier');
  }

  // Purifiers
  for (const model of platformConsts.models.purifierSingle || []) {
    modelCategoryMap.set(model.toUpperCase(), 'purifier');
  }
  for (const model of platformConsts.models.purifierH7120 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'purifier');
  }
  for (const model of platformConsts.models.purifierH7121 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'purifier');
  }
  for (const model of platformConsts.models.purifierH7122 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'purifier');
  }
  for (const model of platformConsts.models.purifierH7123 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'purifier');
  }
  for (const model of platformConsts.models.purifierH7124 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'purifier');
  }
  for (const model of platformConsts.models.purifierH7126 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'purifier');
  }
  for (const model of platformConsts.models.purifierH7127 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'purifier');
  }
  for (const model of platformConsts.models.purifierH7128 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'purifier');
  }
  for (const model of platformConsts.models.purifierH7129 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'purifier');
  }
  for (const model of platformConsts.models.purifierH712C || []) {
    modelCategoryMap.set(model.toUpperCase(), 'purifier');
  }

  // Diffusers
  for (const model of platformConsts.models.diffuserH7161 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'diffuser');
  }
  for (const model of platformConsts.models.diffuserH7162 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'diffuser');
  }

  // Kettles
  registerModelsForCategory('kettle', platformConsts.models.kettle);

  // Ice Makers
  for (const model of platformConsts.models.iceMakerH7172 || []) {
    modelCategoryMap.set(model.toUpperCase(), 'iceMaker');
  }

  // Sensors
  registerModelsForCategory('sensorThermo', platformConsts.models.thermoWifi);
  registerModelsForCategory('sensorThermo', platformConsts.models.thermoWifiHumi);
  registerModelsForCategory('sensorLeak', platformConsts.models.leakSensor);
  registerModelsForCategory('sensorButton', platformConsts.models.button);
  registerModelsForCategory('sensorPresence', platformConsts.models.presenceSensor);

  // Tap / Valve / TV
  for (const model of platformConsts.models.tap || []) {
    modelCategoryMap.set(model.toUpperCase(), 'tap');
  }
  for (const model of platformConsts.models.valve || []) {
    modelCategoryMap.set(model.toUpperCase(), 'valve');
  }
  for (const model of platformConsts.models.tv || []) {
    modelCategoryMap.set(model.toUpperCase(), 'tv');
  }
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
