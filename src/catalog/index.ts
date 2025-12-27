/**
 * Device Catalog Module
 *
 * Exports all catalog types, devices, and command codes.
 */

// Types
export type {
  DeviceCapabilities,
  DeviceModelDefinition,
  DeviceCatalog,
  SpeedCapability,
  TemperatureCapability,
  NightLightCapability,
  DisplayLightCapability,
  LockCapability,
  SwingCapability,
  HomeKitServiceType,
  CharacteristicProps,
  ServiceConfig,
  DeviceCommandType,
  CommandConfig,
  ExternalCommandHandler,
  CategoryDefaults,
  SpeedConfig,
} from './types.js';

// Type helpers
export { createSpeedCapability } from './types.js';

// Device catalog
export {
  deviceCatalog,
  getDeviceDefinition,
  hasCapability,
  getSpeedConfig,
  getAllModels,
  getModelsByCategory,
} from './devices.js';

// Command codes
export {
  // Common codes
  LOCK_CODES,
  DISPLAY_CODES,
  DEVICE_STATE_CODES,
  // Heater codes
  HEATER_SWING_CODES,
  HEATER_H7130_SPEED_CODES,
  HEATER_SPEED_LABELS,
  // Fan codes
  FAN_SWING_CODES,
  FAN_H7102_SPEED_CODES,
  FAN_SPEED_STEP,
  FAN_MAX_SPEED,
  // Humidifier codes
  HUMIDIFIER_H7140_SPEED_CODES,
  HUMIDIFIER_H7142_SPEED_CODES,
  HUMIDIFIER_H7142_UV_ON,
  // Purifier codes
  PURIFIER_H7120_SPEED_CODES,
  PURIFIER_H7120_NIGHT_LIGHT_CODES,
  PURIFIER_H7122_SPEED_CODES,
  PURIFIER_H7123_SPEED_CODES,
  PURIFIER_H7126_SPEED_CODES,
  PURIFIER_H7127_SPEED_CODES,
  // Labels
  SPEED_LABELS_3,
  SPEED_LABELS_4,
  SPEED_LABELS_5,
  AIR_QUALITY_LABELS,
  PM25_THRESHOLDS,
  PURIFIER_SPEED_COMMAND_MAP,
  // Helpers
  getAirQualityFromPM25,
  getAirQualityLabelFromPM25,
} from './commands.js';
