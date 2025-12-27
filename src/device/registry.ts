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
  | 'sensorThermoSwitch'
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

// Model-specific handlers (take priority over category handlers)
const modelHandlers = new Map<string, DeviceHandlerClass>();

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
 * Register a device handler for a specific model (takes priority over category)
 */
export function registerModelHandler(
  model: string,
  handler: DeviceHandlerClass,
): void {
  modelHandlers.set(model.toUpperCase(), handler);
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
 * Get the device handler class for a model number.
 * Model-specific handlers take priority over category handlers.
 */
export function getDeviceHandlerForModel(model: string): DeviceHandlerClass | undefined {
  const modelUpper = model.toUpperCase();

  // Check for model-specific handler first
  const modelHandler = modelHandlers.get(modelUpper);
  if (modelHandler) {
    return modelHandler;
  }

  // Fall back to category handler
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
  // Check for config-based handler overrides
  const deviceId = accessory.context.gvDeviceId;
  const deviceConf = platform.deviceConf[deviceId] as Record<string, unknown> | undefined;

  // Special case: thermo sensors with showExtraSwitch use the thermoSwitch handler
  const category = getCategoryForModel(model);
  if (category === 'sensorThermo' && deviceConf?.showExtraSwitch) {
    const thermoSwitchHandler = getDeviceHandler('sensorThermoSwitch');
    if (thermoSwitchHandler) {
      const instance = new thermoSwitchHandler(platform, accessory);
      instance.init();
      return instance;
    }
  }

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
  registerModelHandler,
  getCategoryForModel,
  getDeviceHandler,
  getDeviceHandlerForModel,
  createDeviceInstance,
  initializeModelMappings,
  getRegisteredCategories,
  isModelSupported,
};
