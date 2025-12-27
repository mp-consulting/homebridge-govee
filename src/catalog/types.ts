/**
 * Device Catalog Types
 *
 * Defines the structure for the device catalog that describes
 * capabilities, commands, and HomeKit services for each device model.
 */

import type { DeviceCategory } from '../device/registry.js';

// ============================================================================
// Capability Definitions
// ============================================================================

/**
 * Speed control capability configuration
 */
export interface SpeedCapability {
  /** Maximum number of speed levels (e.g., 4, 8, 9) */
  maxSpeed: number;
  /** Step size for HomeKit (calculated from maxSpeed if not provided) */
  stepSize?: number;
  /** Valid values for HomeKit speed characteristic */
  validValues?: number[];
  /** Speed command codes indexed by speed level (1-based) */
  codes: Record<number, string>;
}

/**
 * Temperature control capability configuration
 */
export interface TemperatureCapability {
  /** Minimum temperature in Celsius */
  min: number;
  /** Maximum temperature in Celsius */
  max: number;
  /** Temperature step size */
  step?: number;
  /** Temperature command codes indexed by temperature value */
  codes?: Record<number, string>;
  /** Temperature codes with device on */
  onCodes?: Record<number, string>;
}

/**
 * Night light capability configuration
 */
export interface NightLightCapability {
  /** Whether the night light supports RGB colors */
  rgb?: boolean;
  /** Whether the night light supports brightness */
  brightness?: boolean;
  /** Command codes for night light on/off */
  codes?: {
    on: string;
    off: string;
  };
}

/**
 * Display light capability configuration
 */
export interface DisplayLightCapability {
  /** Command codes for display light on/off */
  codes?: {
    on: string;
    off: string;
  };
}

/**
 * Lock control capability configuration
 */
export interface LockCapability {
  /** Command codes for lock on/off */
  codes?: {
    on: string;
    off: string;
  };
}

/**
 * Swing/oscillation capability configuration
 */
export interface SwingCapability {
  /** Command codes for swing on/off */
  codes?: {
    on: string;
    off: string;
  };
}

/**
 * All possible device capabilities
 */
export interface DeviceCapabilities {
  /** On/off control */
  onOff?: boolean;
  /** Speed control (fans, purifiers, humidifiers) */
  speed?: SpeedCapability;
  /** Temperature control (heaters, coolers) */
  temperature?: TemperatureCapability;
  /** Brightness control (lights) */
  brightness?: boolean;
  /** RGB color control */
  color?: boolean;
  /** Color temperature control */
  colorTemperature?: {
    min?: number;
    max?: number;
  };
  /** Humidity sensor */
  humiditySensor?: boolean;
  /** Temperature sensor */
  temperatureSensor?: boolean;
  /** Night light feature */
  nightLight?: NightLightCapability;
  /** Display light feature */
  displayLight?: DisplayLightCapability;
  /** Child lock feature */
  lock?: LockCapability;
  /** Swing/oscillation feature */
  swing?: SwingCapability;
  /** UV light feature (humidifiers) */
  uvLight?: boolean;
  /** Air quality sensor (PM2.5) */
  airQuality?: boolean;
  /** Filter life monitoring */
  filterLife?: boolean;
  /** Power monitoring (outlets) */
  powerMonitoring?: boolean;
  /** Battery level (sensors) */
  battery?: boolean;
}

// ============================================================================
// HomeKit Service Configuration
// ============================================================================

/**
 * HomeKit service types supported by the plugin
 */
export type HomeKitServiceType =
  | 'Lightbulb'
  | 'Switch'
  | 'Outlet'
  | 'Fan'
  | 'AirPurifier'
  | 'HeaterCooler'
  | 'HumiditySensor'
  | 'TemperatureSensor'
  | 'LeakSensor'
  | 'ContactSensor'
  | 'MotionSensor'
  | 'OccupancySensor'
  | 'StatelessProgrammableSwitch'
  | 'Television'
  | 'Valve'
  | 'AirQualitySensor'
  | 'BatteryService'
  | 'FilterMaintenance';

/**
 * Characteristic properties for HomeKit
 */
export interface CharacteristicProps {
  minValue?: number;
  maxValue?: number;
  minStep?: number;
  validValues?: number[];
}

/**
 * Service configuration for HomeKit
 */
export interface ServiceConfig {
  /** Service type */
  type: HomeKitServiceType;
  /** Whether this is the primary service */
  primary?: boolean;
  /** Custom name for the service */
  name?: string;
  /** Characteristic properties */
  characteristics?: Record<string, CharacteristicProps>;
}

// ============================================================================
// Command Configuration
// ============================================================================

/**
 * Command type for device control
 */
export type DeviceCommandType =
  | 'state'
  | 'stateDual'
  | 'stateOutlet'
  | 'stateHumi'
  | 'statePuri'
  | 'stateHeat'
  | 'multiSync'
  | 'ptReal'
  | 'brightness'
  | 'color'
  | 'colorTem'
  | 'colorwc'
  | 'scene'
  | 'mode'
  | 'speed'
  | 'swing'
  | 'nightLight'
  | 'displayLight'
  | 'lock';

/**
 * Command configuration for a capability
 */
export interface CommandConfig {
  /** Command type to send */
  cmd: DeviceCommandType;
  /** Static command codes for simple on/off features */
  codes?: {
    on?: string;
    off?: string;
  };
  /** Indexed command codes (for speed levels, temperatures, etc.) */
  indexedCodes?: Record<number | string, string>;
}

/**
 * External update command handlers
 */
export interface ExternalCommandHandler {
  /** Command prefix to match (e.g., '0501' for speed) */
  prefix: string;
  /** Handler type for processing */
  handler: 'speed' | 'temperature' | 'humidity' | 'nightLight' | 'display' | 'lock' | 'mode' | 'ignore';
  /** Position of the value in hex parts (0-indexed) */
  valuePosition?: number;
}

// ============================================================================
// Device Model Definition
// ============================================================================

/**
 * Complete device model definition
 */
export interface DeviceModelDefinition {
  /** Model number (e.g., 'H7142') */
  model: string;
  /** Human-readable name */
  name: string;
  /** Device category for handler selection */
  category: DeviceCategory;
  /** Device capabilities */
  capabilities: DeviceCapabilities;
  /** HomeKit services to create */
  services: ServiceConfig[];
  /** Command configurations by capability */
  commands?: Record<string, CommandConfig>;
  /** External update command handlers */
  externalCommands?: ExternalCommandHandler[];
  /** Special features or flags */
  features?: {
    /** Whether device supports Matter */
    matter?: boolean;
    /** Whether device is LAN-only */
    lanOnly?: boolean;
    /** Custom handler class name (if different from category default) */
    customHandler?: string;
  };
}

/**
 * Device catalog - maps model numbers to their definitions
 */
export type DeviceCatalog = Map<string, DeviceModelDefinition>;

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Category defaults - default capabilities for a device category
 */
export interface CategoryDefaults {
  category: DeviceCategory;
  services: ServiceConfig[];
  capabilities: Partial<DeviceCapabilities>;
  commands?: Record<string, CommandConfig>;
}

/**
 * Speed configuration shorthand
 */
export interface SpeedConfig {
  maxSpeed: number;
  codes: Record<number, string>;
}

/**
 * Create a speed capability from a simple config
 */
export function createSpeedCapability(config: SpeedConfig): SpeedCapability {
  const stepSize = Math.round(100 / config.maxSpeed);
  const validValues = [0];
  for (let i = 1; i <= config.maxSpeed; i++) {
    validValues.push(Math.round((i / config.maxSpeed) * 100));
  }
  return {
    maxSpeed: config.maxSpeed,
    stepSize,
    validValues,
    codes: config.codes,
  };
}

export default {
  createSpeedCapability,
};
