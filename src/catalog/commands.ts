/**
 * Device Command Codes Catalog
 *
 * Centralized repository of all command codes extracted from device handlers.
 * This allows multiple handlers to share the same codes and makes it easy
 * to add new device support without duplicating code.
 */

// ============================================================================
// Common Codes (shared across multiple device types)
// ============================================================================

/**
 * Lock control codes (shared by most purifiers)
 */
export const LOCK_CODES = {
  on: 'MxABAAAAAAAAAAAAAAAAAAAAACI=',
  off: 'MxAAAAAAAAAAAAAAAAAAAAAAACM=',
} as const;

/**
 * Display light codes (shared by most purifiers)
 */
export const DISPLAY_CODES = {
  on: 'MxYBAAAAAAAAAAAAAAAAAAAAACQ=',
  off: 'MxYAAAAAAAAAAAAAAAAAAAAAACU=',
} as const;

/**
 * Device state on/off codes (shared by heaters and fans)
 */
export const DEVICE_STATE_CODES = {
  on: 'MwEBAAAAAAAAAAAAAAAAAAAAADM=',
  off: 'MwEAAAAAAAAAAAAAAAAAAAAAADI=',
} as const;

/**
 * Swing/oscillation codes for heaters (H7130)
 */
export const HEATER_SWING_CODES = {
  on: 'MxgBAAAAAAAAAAAAAAAAAAAAACo=',
  off: 'MxgAAAAAAAAAAAAAAAAAAAAAACs=',
} as const;

/**
 * Swing/oscillation codes for fans (H7102)
 */
export const FAN_SWING_CODES = {
  on: 'Mx8BAQAAAAAAAAAAAAAAAAAAACw=',
  off: 'Mx8BAAAAAAAAAAAAAAAAAAAAAC0=',
} as const;

// ============================================================================
// Heater Speed Codes
// ============================================================================

/**
 * Speed codes for H7130/H7131 heater (3 speeds at 33% increments)
 * 33=low, 66=medium, 99=high
 */
export const HEATER_H7130_SPEED_CODES: Record<number, string> = {
  33: 'MwUBAAAAAAAAAAAAAAAAAAAAADc=',
  66: 'MwUCAAAAAAAAAAAAAAAAAAAAADQ=',
  99: 'MwUDAAAAAAAAAAAAAAAAAAAAADU=',
};

/**
 * Speed labels for heater
 */
export const HEATER_SPEED_LABELS: Record<number, string> = {
  33: 'low',
  66: 'medium',
  99: 'high',
};

/**
 * Temperature codes for H7130 heater in auto mode (5-30°C)
 */
export const HEATER_H7130_TEMP_CODES_AUTO: Record<number, string> = {
  5: 'MxoBAJAEAAAAAAAAAAAAAAAAALw=',
  6: 'MxoBAJBoAAAAAAAAAAAAAAAAANA=',
  7: 'MxoBAJEwAAAAAAAAAAAAAAAAAIk=',
  8: 'MxoBAJH4AAAAAAAAAAAAAAAAAEE=',
  9: 'MxoBAJLAAAAAAAAAAAAAAAAAAHo=',
  10: 'MxoBAJOIAAAAAAAAAAAAAAAAADM=',
  11: 'MxoBAJPsAAAAAAAAAAAAAAAAAFc=',
  12: 'MxoBAJS0AAAAAAAAAAAAAAAAAAg=',
  13: 'MxoBAJV8AAAAAAAAAAAAAAAAAME=',
  14: 'MxoBAJZEAAAAAAAAAAAAAAAAAPo=',
  15: 'MxoBAJcMAAAAAAAAAAAAAAAAALM=',
  16: 'MxoBAJdwAAAAAAAAAAAAAAAAAM8=',
  17: 'MxoBAJg4AAAAAAAAAAAAAAAAAIg=',
  18: 'MxoBAJkAAAAAAAAAAAAAAAAAALE=',
  19: 'MxoBAJnIAAAAAAAAAAAAAAAAAHk=',
  20: 'MxoBAJqQAAAAAAAAAAAAAAAAACI=',
  21: 'MxoBAJr0AAAAAAAAAAAAAAAAAEY=',
  22: 'MxoBAJu8AAAAAAAAAAAAAAAAAA8=',
  23: 'MxoBAJyEAAAAAAAAAAAAAAAAADA=',
  24: 'MxoBAJ1MAAAAAAAAAAAAAAAAAPk=',
  25: 'MxoBAJ4UAAAAAAAAAAAAAAAAAKI=',
  26: 'MxoBAJ54AAAAAAAAAAAAAAAAAM4=',
  27: 'MxoBAJ9AAAAAAAAAAAAAAAAAAPc=',
  28: 'MxoBAKAIAAAAAAAAAAAAAAAAAIA=',
  29: 'MxoBAKDQAAAAAAAAAAAAAAAAAFg=',
  30: 'MxoBAKGYAAAAAAAAAAAAAAAAABE=',
};

/**
 * Temperature codes for H7130 heater in heat mode (5-30°C)
 */
export const HEATER_H7130_TEMP_CODES_HEAT: Record<number, string> = {
  5: 'MxoAAJAEAAAAAAAAAAAAAAAAAL0=',
  6: 'MxoAAJBoAAAAAAAAAAAAAAAAANE=',
  7: 'MxoAAJEwAAAAAAAAAAAAAAAAAIg=',
  8: 'MxoAAJH4AAAAAAAAAAAAAAAAAEA=',
  9: 'MxoAAJLAAAAAAAAAAAAAAAAAAHs=',
  10: 'MxoAAJOIAAAAAAAAAAAAAAAAADI=',
  11: 'MxoAAJPsAAAAAAAAAAAAAAAAAFY=',
  12: 'MxoAAJS0AAAAAAAAAAAAAAAAAAk=',
  13: 'MxoAAJV8AAAAAAAAAAAAAAAAAMA=',
  14: 'MxoAAJZEAAAAAAAAAAAAAAAAAPs=',
  15: 'MxoAAJcMAAAAAAAAAAAAAAAAALI=',
  16: 'MxoAAJdwAAAAAAAAAAAAAAAAAM4=',
  17: 'MxoAAJg4AAAAAAAAAAAAAAAAAIk=',
  18: 'MxoAAJkAAAAAAAAAAAAAAAAAALA=',
  19: 'MxoAAJnIAAAAAAAAAAAAAAAAAHg=',
  20: 'MxoAAJqQAAAAAAAAAAAAAAAAACM=',
  21: 'MxoAAJr0AAAAAAAAAAAAAAAAAEc=',
  22: 'MxoAAJu8AAAAAAAAAAAAAAAAAA4=',
  23: 'MxoAAJyEAAAAAAAAAAAAAAAAADE=',
  24: 'MxoAAJ1MAAAAAAAAAAAAAAAAAPg=',
  25: 'MxoAAJ4UAAAAAAAAAAAAAAAAAKM=',
  26: 'MxoAAJ54AAAAAAAAAAAAAAAAAM8=',
  27: 'MxoAAJ9AAAAAAAAAAAAAAAAAAPY=',
  28: 'MxoAAKAIAAAAAAAAAAAAAAAAAIE=',
  29: 'MxoAAKDQAAAAAAAAAAAAAAAAAFk=',
  30: 'MxoAAKGYAAAAAAAAAAAAAAAAABA=',
};

/**
 * Heater temperature range constants
 */
export const HEATER_TEMP_MIN = 5;
export const HEATER_TEMP_MAX = 30;

// ============================================================================
// Fan Speed Codes
// ============================================================================

/**
 * Speed codes for H7102 fan (8 speeds at 11% increments)
 */
export const FAN_H7102_SPEED_CODES: Record<number, string> = {
  11: 'MwUBAQAAAAAAAAAAAAAAAAAAADY=',
  22: 'MwUBAgAAAAAAAAAAAAAAAAAAADU=',
  33: 'MwUBAwAAAAAAAAAAAAAAAAAAADQ=',
  44: 'MwUBBAAAAAAAAAAAAAAAAAAAADM=',
  55: 'MwUBBQAAAAAAAAAAAAAAAAAAADI=',
  66: 'MwUBBgAAAAAAAAAAAAAAAAAAADE=',
  77: 'MwUBBwAAAAAAAAAAAAAAAAAAADA=',
  88: 'MwUBCAAAAAAAAAAAAAAAAAAAAD8=',
};

/**
 * Fan speed step size constants
 */
export const FAN_SPEED_STEP = 11;
export const FAN_MAX_SPEED = 8;

// ============================================================================
// Humidifier Speed Codes
// ============================================================================

/**
 * Speed codes for H7140 humidifier (8 speeds)
 */
export const HUMIDIFIER_H7140_SPEED_CODES: Record<number, string> = {
  1: 'MwUBAQAAAAAAAAAAAAAAAAAAADY=',
  2: 'MwUBAgAAAAAAAAAAAAAAAAAAADU=',
  3: 'MwUBAwAAAAAAAAAAAAAAAAAAADQ=',
  4: 'MwUBBAAAAAAAAAAAAAAAAAAAADM=',
  5: 'MwUBBQAAAAAAAAAAAAAAAAAAADI=',
  6: 'MwUBBgAAAAAAAAAAAAAAAAAAADE=',
  7: 'MwUBBwAAAAAAAAAAAAAAAAAAADA=',
  8: 'MwUBCAAAAAAAAAAAAAAAAAAAAD8=',
};

/**
 * Speed codes for H7142 humidifier (9 speeds)
 */
export const HUMIDIFIER_H7142_SPEED_CODES: Record<number, string> = {
  1: 'MwUBAQAAAAAAAAAAAAAAAAAAADY=',
  2: 'MwUBAgAAAAAAAAAAAAAAAAAAADU=',
  3: 'MwUBAwAAAAAAAAAAAAAAAAAAADQ=',
  4: 'MwUBBAAAAAAAAAAAAAAAAAAAADM=',
  5: 'MwUBBQAAAAAAAAAAAAAAAAAAADI=',
  6: 'MwUBBgAAAAAAAAAAAAAAAAAAADE=',
  7: 'MwUBBwAAAAAAAAAAAAAAAAAAADA=',
  8: 'MwUBCAAAAAAAAAAAAAAAAAAAAD8=',
  9: 'MwUBCQAAAAAAAAAAAAAAAAAAAD4=',
};

/**
 * UV light code for H7142 humidifier
 */
export const HUMIDIFIER_H7142_UV_ON = 'MxoBAAAAAAAAAAAAAAAAAAAAACg=';

// ============================================================================
// Purifier Speed Codes
// ============================================================================

/**
 * Speed codes for H7120/H7121 purifier (4 speeds at 25% increments)
 * 1=sleep, 2=low, 3=medium, 4=high
 */
export const PURIFIER_H7120_SPEED_CODES: Record<number, string> = {
  1: 'MwUQAAAAAAAAAAAAAAAAAAAAACY=', // sleep
  2: 'MwUBAAAAAAAAAAAAAAAAAAAAADc=', // low
  3: 'MwUCAAAAAAAAAAAAAAAAAAAAADQ=', // medium
  4: 'MwUDAAAAAAAAAAAAAAAAAAAAADU=', // high
};

/**
 * Night light codes for H7120/H7121 purifier
 */
export const PURIFIER_H7120_NIGHT_LIGHT_CODES = {
  on: 'MxgBMgAAAAAAAAAAAAAAAAAAABg=',
  off: 'MxgAMgAAAAAAAAAAAAAAAAAAABk=',
} as const;

/**
 * Speed codes for H7122 purifier (5 modes at 20% increments)
 * 1=sleep, 2=low, 3=med, 4=high, 5=auto
 */
export const PURIFIER_H7122_SPEED_CODES: Record<number, string> = {
  1: 'OgUFAAAAAAAAAAAAAAAAAAAAADo=', // sleep
  2: 'OgUBAQAAAAAAAAAAAAAAAAAAAD8=', // low
  3: 'OgUBAgAAAAAAAAAAAAAAAAAAADw=', // med
  4: 'OgUBAwAAAAAAAAAAAAAAAAAAAD0=', // high
  5: 'OgUDAAAAAAAAAAAAAAAAAAAAADw=', // auto
};

/**
 * Speed codes for H7123/H7124 purifier (5 modes at 20% increments)
 * Same as H7122
 */
export const PURIFIER_H7123_SPEED_CODES = PURIFIER_H7122_SPEED_CODES;

/**
 * Speed codes for H7126 purifier (3 speeds at 33% increments)
 * 1=sleep, 2=low, 3=high
 */
export const PURIFIER_H7126_SPEED_CODES: Record<number, string> = {
  1: 'MwUBAQAAAAAAAAAAAAAAAAAAADY=', // sleep
  2: 'MwUBAgAAAAAAAAAAAAAAAAAAADU=', // low
  3: 'MwUBAwAAAAAAAAAAAAAAAAAAADQ=', // high
};

/**
 * Speed codes for H7127/H7128/H7129/H712C purifier (3 speeds at 33% increments)
 * Same as H7126
 */
export const PURIFIER_H7127_SPEED_CODES = PURIFIER_H7126_SPEED_CODES;

// ============================================================================
// Speed Mode Labels
// ============================================================================

/**
 * Speed mode labels for 4-speed purifiers
 */
export const SPEED_LABELS_4 = ['off', 'sleep', 'low', 'medium', 'high'] as const;

/**
 * Speed mode labels for 5-speed purifiers
 */
export const SPEED_LABELS_5 = ['off', 'sleep', 'low', 'medium', 'high', 'auto'] as const;

/**
 * Speed mode labels for 3-speed purifiers
 */
export const SPEED_LABELS_3 = ['off', 'sleep', 'low', 'high'] as const;

// ============================================================================
// External Command Prefixes
// ============================================================================

/**
 * External command prefixes for purifier speed updates
 */
export const PURIFIER_SPEED_COMMAND_MAP: Record<string, number> = {
  '0500': 1, // Sleep
  '0101': 2, // Low
  '0102': 3, // Medium
  '0103': 4, // High
  '0300': 5, // Auto
};

// ============================================================================
// Air Quality Mapping
// ============================================================================

/**
 * Air quality labels based on HomeKit values
 */
export const AIR_QUALITY_LABELS: Record<number, string> = {
  1: 'excellent',
  2: 'good',
  3: 'fair',
  4: 'inferior',
  5: 'poor',
};

/**
 * PM2.5 thresholds for air quality determination (µg/m³)
 * Based on Govee manual guidelines
 */
export const PM25_THRESHOLDS = {
  excellent: 12,
  good: 35,
  fair: 75,
  inferior: 115,
} as const;

/**
 * Get air quality value from PM2.5 reading
 */
export function getAirQualityFromPM25(pm25: number): number {
  if (pm25 <= PM25_THRESHOLDS.excellent) {
    return 1;
  }
  if (pm25 <= PM25_THRESHOLDS.good) {
    return 2;
  }
  if (pm25 <= PM25_THRESHOLDS.fair) {
    return 3;
  }
  if (pm25 <= PM25_THRESHOLDS.inferior) {
    return 4;
  }
  return 5;
}

/**
 * Get air quality label from PM2.5 reading
 */
export function getAirQualityLabelFromPM25(pm25: number): string {
  const value = getAirQualityFromPM25(pm25);
  return AIR_QUALITY_LABELS[value] || 'unknown';
}

// ============================================================================
// Type Exports
// ============================================================================

export type LockCodes = typeof LOCK_CODES;
export type DisplayCodes = typeof DISPLAY_CODES;
export type SpeedCodes = Record<number, string>;
export type OnOffCodes = { on: string; off: string };

export default {
  LOCK_CODES,
  DISPLAY_CODES,
  DEVICE_STATE_CODES,
  HEATER_SWING_CODES,
  FAN_SWING_CODES,
  HEATER_H7130_SPEED_CODES,
  HEATER_SPEED_LABELS,
  HEATER_H7130_TEMP_CODES_AUTO,
  HEATER_H7130_TEMP_CODES_HEAT,
  HEATER_TEMP_MIN,
  HEATER_TEMP_MAX,
  FAN_H7102_SPEED_CODES,
  FAN_SPEED_STEP,
  FAN_MAX_SPEED,
  HUMIDIFIER_H7140_SPEED_CODES,
  HUMIDIFIER_H7142_SPEED_CODES,
  HUMIDIFIER_H7142_UV_ON,
  PURIFIER_H7120_SPEED_CODES,
  PURIFIER_H7120_NIGHT_LIGHT_CODES,
  PURIFIER_H7122_SPEED_CODES,
  PURIFIER_H7123_SPEED_CODES,
  PURIFIER_H7126_SPEED_CODES,
  PURIFIER_H7127_SPEED_CODES,
  SPEED_LABELS_3,
  SPEED_LABELS_4,
  SPEED_LABELS_5,
  AIR_QUALITY_LABELS,
  PM25_THRESHOLDS,
  getAirQualityFromPM25,
  getAirQualityLabelFromPM25,
};
