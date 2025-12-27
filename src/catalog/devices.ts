/**
 * Device Catalog
 *
 * Central registry of all supported device models with their capabilities,
 * services, and command configurations.
 */

import type { DeviceModelDefinition, DeviceCatalog, SpeedCapability } from './types.js';
import {
  HUMIDIFIER_H7140_SPEED_CODES,
  HUMIDIFIER_H7142_SPEED_CODES,
  PURIFIER_H7120_SPEED_CODES,
  PURIFIER_H7120_NIGHT_LIGHT_CODES,
  PURIFIER_H7122_SPEED_CODES,
  PURIFIER_H7126_SPEED_CODES,
  PURIFIER_H7127_SPEED_CODES,
  LOCK_CODES,
  DISPLAY_CODES,
} from './commands.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create speed capability configuration
 */
function createSpeedCapability(
  maxSpeed: number,
  codes: Record<number, string>,
  stepSize?: number,
): SpeedCapability {
  const calculatedStep = stepSize ?? Math.round(100 / maxSpeed);
  const validValues = [0];
  for (let i = 1; i <= maxSpeed; i++) {
    validValues.push(Math.round((i / maxSpeed) * 100));
  }
  return {
    maxSpeed,
    stepSize: calculatedStep,
    validValues,
    codes,
  };
}

// ============================================================================
// Humidifier Device Definitions
// ============================================================================

const humidifierH7140: DeviceModelDefinition = {
  model: 'H7140',
  name: 'Govee Smart Humidifier',
  category: 'humidifier',
  capabilities: {
    onOff: true,
    speed: createSpeedCapability(8, HUMIDIFIER_H7140_SPEED_CODES),
    nightLight: { rgb: false, brightness: true },
  },
  services: [
    { type: 'Fan', primary: true },
    { type: 'Lightbulb', name: 'Night Light' },
  ],
  commands: {
    state: { cmd: 'stateHumi' },
    speed: { cmd: 'ptReal', indexedCodes: HUMIDIFIER_H7140_SPEED_CODES },
  },
  externalCommands: [
    { prefix: '1b00', handler: 'nightLight', valuePosition: 3 },
    { prefix: '1b01', handler: 'nightLight', valuePosition: 3 },
  ],
};

const humidifierH7141: DeviceModelDefinition = {
  ...humidifierH7140,
  model: 'H7141',
  name: 'Govee Smart Humidifier H7141',
};

const humidifierH7142: DeviceModelDefinition = {
  model: 'H7142',
  name: 'Govee Smart Humidifier H7142',
  category: 'humidifier',
  capabilities: {
    onOff: true,
    speed: createSpeedCapability(9, HUMIDIFIER_H7142_SPEED_CODES),
    humiditySensor: true,
    nightLight: { rgb: true, brightness: true },
    uvLight: true,
  },
  services: [
    { type: 'Fan', primary: true },
    { type: 'HumiditySensor' },
    { type: 'Lightbulb', name: 'Night Light' },
  ],
  commands: {
    state: { cmd: 'stateHumi' },
    speed: { cmd: 'ptReal', indexedCodes: HUMIDIFIER_H7142_SPEED_CODES },
  },
  externalCommands: [
    { prefix: '0500', handler: 'mode', valuePosition: 4 },
    { prefix: '0501', handler: 'speed', valuePosition: 4 },
    { prefix: '1001', handler: 'humidity', valuePosition: 4 },
    { prefix: '1800', handler: 'display' },
    { prefix: '1801', handler: 'display' },
    { prefix: '1a00', handler: 'ignore' },
    { prefix: '1a01', handler: 'ignore' },
    { prefix: '1b00', handler: 'nightLight', valuePosition: 3 },
    { prefix: '1b01', handler: 'nightLight', valuePosition: 3 },
  ],
  features: {
    customHandler: 'HumidifierH7142Device',
  },
};

const humidifierH7143: DeviceModelDefinition = {
  ...humidifierH7140,
  model: 'H7143',
  name: 'Govee Smart Humidifier H7143',
};

const humidifierH7145: DeviceModelDefinition = {
  ...humidifierH7140,
  model: 'H7145',
  name: 'Govee Smart Humidifier H7145',
};

const humidifierH7147: DeviceModelDefinition = {
  ...humidifierH7140,
  model: 'H7147',
  name: 'Govee Smart Humidifier H7147',
};

const humidifierH7148: DeviceModelDefinition = {
  ...humidifierH7140,
  model: 'H7148',
  name: 'Govee Smart Humidifier H7148',
};

const humidifierH7149: DeviceModelDefinition = {
  ...humidifierH7140,
  model: 'H7149',
  name: 'Govee Smart Humidifier H7149',
};

const humidifierH714E: DeviceModelDefinition = {
  ...humidifierH7140,
  model: 'H714E',
  name: 'Govee Smart Humidifier H714E',
};

// ============================================================================
// Purifier Device Definitions
// ============================================================================

const purifierH7120: DeviceModelDefinition = {
  model: 'H7120',
  name: 'Govee Smart Air Purifier H7120',
  category: 'purifier',
  capabilities: {
    onOff: true,
    speed: createSpeedCapability(4, PURIFIER_H7120_SPEED_CODES, 25),
    nightLight: {
      codes: PURIFIER_H7120_NIGHT_LIGHT_CODES,
    },
    displayLight: {
      codes: DISPLAY_CODES,
    },
    lock: {
      codes: LOCK_CODES,
    },
  },
  services: [
    {
      type: 'AirPurifier',
      primary: true,
      characteristics: {
        RotationSpeed: { minStep: 25, validValues: [0, 25, 50, 75, 100] },
        TargetAirPurifierState: { minValue: 1, maxValue: 1, validValues: [1] },
      },
    },
  ],
  commands: {
    state: { cmd: 'statePuri' },
    speed: { cmd: 'ptReal', indexedCodes: PURIFIER_H7120_SPEED_CODES },
    nightLight: { cmd: 'ptReal', codes: PURIFIER_H7120_NIGHT_LIGHT_CODES },
    lock: { cmd: 'ptReal', codes: LOCK_CODES },
    displayLight: { cmd: 'ptReal', codes: DISPLAY_CODES },
  },
  features: {
    customHandler: 'PurifierH7120Device',
  },
};

const purifierH7121: DeviceModelDefinition = {
  ...purifierH7120,
  model: 'H7121',
  name: 'Govee Smart Air Purifier H7121',
};

const purifierH7122: DeviceModelDefinition = {
  model: 'H7122',
  name: 'Govee Smart Air Purifier H7122',
  category: 'purifier',
  capabilities: {
    onOff: true,
    speed: createSpeedCapability(5, PURIFIER_H7122_SPEED_CODES, 20),
    airQuality: true,
    displayLight: {
      codes: DISPLAY_CODES,
    },
    lock: {
      codes: LOCK_CODES,
    },
  },
  services: [
    {
      type: 'AirPurifier',
      primary: true,
      characteristics: {
        RotationSpeed: { minStep: 20, validValues: [0, 20, 40, 60, 80, 100] },
        TargetAirPurifierState: { minValue: 1, maxValue: 1, validValues: [1] },
      },
    },
    { type: 'AirQualitySensor' },
  ],
  commands: {
    state: { cmd: 'statePuri' },
    speed: { cmd: 'ptReal', indexedCodes: PURIFIER_H7122_SPEED_CODES },
    lock: { cmd: 'ptReal', codes: LOCK_CODES },
    displayLight: { cmd: 'ptReal', codes: DISPLAY_CODES },
  },
  externalCommands: [
    { prefix: 'aa05', handler: 'speed', valuePosition: 3 },
    { prefix: '3a05', handler: 'speed', valuePosition: 3 },
    { prefix: 'aa10', handler: 'lock', valuePosition: 3 },
    { prefix: 'aa16', handler: 'display', valuePosition: 3 },
    { prefix: 'aa1c', handler: 'ignore' }, // Air quality - handled separately
    { prefix: 'aa11', handler: 'ignore' },
    { prefix: 'aa13', handler: 'ignore' },
    { prefix: '3310', handler: 'ignore' },
    { prefix: '3311', handler: 'ignore' },
    { prefix: '3313', handler: 'ignore' },
    { prefix: '3316', handler: 'ignore' },
  ],
  features: {
    customHandler: 'PurifierH7122Device',
  },
};

const purifierH7123: DeviceModelDefinition = {
  model: 'H7123',
  name: 'Govee Smart Air Purifier H7123',
  category: 'purifier',
  capabilities: {
    onOff: true,
    speed: createSpeedCapability(5, PURIFIER_H7122_SPEED_CODES, 20),
    airQuality: true, // Simple air quality (no PM2.5)
    nightLight: {}, // Read-only
    displayLight: {
      codes: DISPLAY_CODES,
    },
    lock: {
      codes: LOCK_CODES,
    },
  },
  services: [
    {
      type: 'AirPurifier',
      primary: true,
      characteristics: {
        RotationSpeed: { minStep: 20, validValues: [0, 20, 40, 60, 80, 100] },
        TargetAirPurifierState: { minValue: 1, maxValue: 1, validValues: [1] },
      },
    },
    { type: 'AirQualitySensor' },
  ],
  commands: {
    state: { cmd: 'statePuri' },
    speed: { cmd: 'ptReal', indexedCodes: PURIFIER_H7122_SPEED_CODES },
    lock: { cmd: 'ptReal', codes: LOCK_CODES },
    displayLight: { cmd: 'ptReal', codes: DISPLAY_CODES },
  },
  features: {
    customHandler: 'PurifierH7123Device',
  },
};

const purifierH7124: DeviceModelDefinition = {
  ...purifierH7123,
  model: 'H7124',
  name: 'Govee Smart Air Purifier H7124',
};

const purifierH7126: DeviceModelDefinition = {
  model: 'H7126',
  name: 'Govee Smart Air Purifier H7126',
  category: 'purifier',
  capabilities: {
    onOff: true,
    speed: {
      maxSpeed: 3,
      stepSize: 25,
      validValues: [0, 33, 66, 99],
      codes: PURIFIER_H7126_SPEED_CODES,
    },
    displayLight: {
      codes: DISPLAY_CODES,
    },
    lock: {
      codes: LOCK_CODES,
    },
  },
  services: [
    {
      type: 'AirPurifier',
      primary: true,
      characteristics: {
        RotationSpeed: { minStep: 25, validValues: [0, 33, 66, 99] },
      },
    },
  ],
  commands: {
    state: { cmd: 'statePuri' },
    speed: { cmd: 'ptReal', indexedCodes: PURIFIER_H7126_SPEED_CODES },
    lock: { cmd: 'ptReal', codes: LOCK_CODES },
    displayLight: { cmd: 'ptReal', codes: DISPLAY_CODES },
  },
  externalCommands: [
    { prefix: '0501', handler: 'speed', valuePosition: 4 },
    { prefix: '1000', handler: 'lock' },
    { prefix: '1001', handler: 'lock' },
    { prefix: '1600', handler: 'display' },
    { prefix: '1601', handler: 'display' },
  ],
  features: {
    customHandler: 'PurifierH7126Device',
  },
};

const purifierH7127: DeviceModelDefinition = {
  model: 'H7127',
  name: 'Govee Smart Air Purifier H7127',
  category: 'purifier',
  capabilities: {
    onOff: true,
    speed: {
      maxSpeed: 3,
      stepSize: 25,
      validValues: [0, 33, 66, 99],
      codes: PURIFIER_H7127_SPEED_CODES,
    },
    displayLight: {
      codes: DISPLAY_CODES,
    },
    lock: {
      codes: LOCK_CODES,
    },
  },
  services: [
    {
      type: 'AirPurifier',
      primary: true,
      characteristics: {
        RotationSpeed: { minStep: 25, validValues: [0, 33, 66, 99] },
      },
    },
  ],
  commands: {
    state: { cmd: 'statePuri' },
    speed: { cmd: 'ptReal', indexedCodes: PURIFIER_H7127_SPEED_CODES },
    lock: { cmd: 'ptReal', codes: LOCK_CODES },
    displayLight: { cmd: 'ptReal', codes: DISPLAY_CODES },
  },
  externalCommands: [
    { prefix: '0501', handler: 'speed', valuePosition: 4 },
    { prefix: '1000', handler: 'lock' },
    { prefix: '1001', handler: 'lock' },
    { prefix: '1600', handler: 'display' },
    { prefix: '1601', handler: 'display' },
  ],
  features: {
    customHandler: 'PurifierH7127Device',
  },
};

const purifierH7128: DeviceModelDefinition = {
  ...purifierH7127,
  model: 'H7128',
  name: 'Govee Smart Air Purifier H7128',
};

const purifierH7129: DeviceModelDefinition = {
  ...purifierH7127,
  model: 'H7129',
  name: 'Govee Smart Air Purifier H7129',
};

const purifierH712C: DeviceModelDefinition = {
  ...purifierH7127,
  model: 'H712C',
  name: 'Govee Smart Air Purifier H712C',
};

// ============================================================================
// Device Catalog
// ============================================================================

/**
 * All device definitions indexed by model number
 */
const deviceDefinitions: DeviceModelDefinition[] = [
  // Humidifiers
  humidifierH7140,
  humidifierH7141,
  humidifierH7142,
  humidifierH7143,
  humidifierH7145,
  humidifierH7147,
  humidifierH7148,
  humidifierH7149,
  humidifierH714E,
  // Purifiers
  purifierH7120,
  purifierH7121,
  purifierH7122,
  purifierH7123,
  purifierH7124,
  purifierH7126,
  purifierH7127,
  purifierH7128,
  purifierH7129,
  purifierH712C,
];

/**
 * Build the device catalog Map
 */
function buildCatalog(): DeviceCatalog {
  const catalog: DeviceCatalog = new Map();
  for (const device of deviceDefinitions) {
    catalog.set(device.model.toUpperCase(), device);
  }
  return catalog;
}

/**
 * The device catalog - maps model numbers to their definitions
 */
export const deviceCatalog = buildCatalog();

/**
 * Get a device definition by model number
 */
export function getDeviceDefinition(model: string): DeviceModelDefinition | undefined {
  return deviceCatalog.get(model.toUpperCase());
}

/**
 * Check if a model has a specific capability
 */
export function hasCapability(
  model: string,
  capability: keyof DeviceModelDefinition['capabilities'],
): boolean {
  const device = getDeviceDefinition(model);
  return device?.capabilities?.[capability] !== undefined;
}

/**
 * Get the speed configuration for a model
 */
export function getSpeedConfig(model: string): SpeedCapability | undefined {
  const device = getDeviceDefinition(model);
  return device?.capabilities?.speed;
}

/**
 * Get all models in the catalog
 */
export function getAllModels(): string[] {
  return Array.from(deviceCatalog.keys());
}

/**
 * Get all models for a specific category
 */
export function getModelsByCategory(category: string): string[] {
  return Array.from(deviceCatalog.values())
    .filter((device) => device.category === category)
    .map((device) => device.model);
}

export default {
  deviceCatalog,
  getDeviceDefinition,
  hasCapability,
  getSpeedConfig,
  getAllModels,
  getModelsByCategory,
};
