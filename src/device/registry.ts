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
  | 'heater1b'
  | 'cooler'
  | 'humidifier'
  | 'dehumidifier'
  | 'purifier'
  | 'diffuser'
  | 'kettle'
  | 'iceMaker'
  | 'sensorThermo'
  | 'sensorThermo4'
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
function registerModelsForCategory(
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

// Handlers an outlet-type device can be shown as, by its `showAs` setting
const SINGLE_SWITCH_SHOW_AS: Record<string, DeviceCategory> = {
  outlet: 'outletSingle',
  switch: 'switchSingle',
  purifier: 'purifier',
  heater: 'heater',
  cooler: 'cooler',
  tap: 'tap',
  valve: 'valve',
  audio: 'tv',
  box: 'tv',
  stick: 'tv',
};

/**
 * The category a device's handler comes from: its model category, unless the device
 * config picks another presentation (`showAs`, `showExtraSwitch`, `tempReporting`).
 * 'default' keeps the model category, so existing accessories never change service type.
 */
export function resolveCategory(model: string, deviceConf: Record<string, unknown> = {}): DeviceCategory | undefined {
  const category = getCategoryForModel(model);
  const showAs = typeof deviceConf.showAs === 'string' ? deviceConf.showAs : 'default';

  switch (category) {
    case 'light':
      return showAs === 'switch' ? 'lightSwitch' : category;
    case 'switchSingle':
      return SINGLE_SWITCH_SHOW_AS[showAs] ?? category;
    case 'switchDouble':
      return showAs === 'outlet' ? 'outletDouble' : category;
    case 'switchTriple':
      return showAs === 'outlet' ? 'outletTriple' : category;
    case 'sensorThermo':
      return deviceConf.showExtraSwitch ? 'sensorThermoSwitch' : category;
    case 'heater':
      return deviceConf.tempReporting ? 'heater1b' : category;
    default:
      return category;
  }
}

/**
 * Create a device instance for the given model
 */
export function createDeviceInstance(
  model: string,
  platform: GoveePlatform,
  accessory: GoveePlatformAccessoryWithControl,
): GoveeDeviceBase | undefined {
  const deviceConf = platform.deviceConf[accessory.context.gvDeviceId] as Record<string, unknown> | undefined;
  const category = resolveCategory(model, deviceConf);

  // A config override picks a category handler; otherwise model-specific handlers win
  const Handler = category && category !== getCategoryForModel(model)
    ? getDeviceHandler(category)
    : getDeviceHandlerForModel(model);
  if (!Handler) {
    return undefined;
  }
  const instance = new Handler(platform, accessory);
  instance.init();
  return instance;
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
  registerModelsForCategory('sensorThermo4', platformConsts.models.sensorThermo4);
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

