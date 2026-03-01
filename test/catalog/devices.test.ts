import { describe, it, expect } from 'vitest';
import {
  deviceCatalog,
  getDeviceDefinition,
  hasCapability,
  getSpeedConfig,
  getAllModels,
  getModelsByCategory,
} from '../../src/catalog/devices.js';

describe('getDeviceDefinition', () => {
  it('returns a definition for a known model', () => {
    const def = getDeviceDefinition('H7140');
    expect(def).toBeDefined();
    expect(def!.model).toBe('H7140');
    expect(def!.name).toContain('Humidifier');
  });

  it('is case-insensitive', () => {
    const upper = getDeviceDefinition('H7140');
    const lower = getDeviceDefinition('h7140');
    expect(upper).toBe(lower);
  });

  it('returns undefined for unknown model', () => {
    expect(getDeviceDefinition('HZZZZ')).toBeUndefined();
  });

  it('returns correct category for purifiers', () => {
    const def = getDeviceDefinition('H7122');
    expect(def).toBeDefined();
    expect(def!.category).toBe('purifier');
  });
});

describe('hasCapability', () => {
  it('returns true for existing capability', () => {
    expect(hasCapability('H7140', 'onOff')).toBe(true);
    expect(hasCapability('H7140', 'speed')).toBe(true);
  });

  it('returns false for missing capability', () => {
    expect(hasCapability('H7140', 'airQuality')).toBe(false);
    expect(hasCapability('H7140', 'lock')).toBe(false);
  });

  it('returns false for unknown model', () => {
    expect(hasCapability('HZZZZ', 'onOff')).toBe(false);
  });

  it('detects air quality on H7122', () => {
    expect(hasCapability('H7122', 'airQuality')).toBe(true);
  });

  it('detects lock on purifiers that have it', () => {
    expect(hasCapability('H7120', 'lock')).toBe(true);
    expect(hasCapability('H7126', 'lock')).toBe(true);
  });

  it('detects night light capability', () => {
    expect(hasCapability('H7140', 'nightLight')).toBe(true);
    expect(hasCapability('H7120', 'nightLight')).toBe(true);
  });

  it('detects humidity sensor on H7142', () => {
    expect(hasCapability('H7142', 'humiditySensor')).toBe(true);
    expect(hasCapability('H7140', 'humiditySensor')).toBe(false);
  });
});

describe('getSpeedConfig', () => {
  it('returns speed config for humidifier', () => {
    const speed = getSpeedConfig('H7140');
    expect(speed).toBeDefined();
    expect(speed!.maxSpeed).toBe(8);
    expect(speed!.codes).toBeDefined();
  });

  it('returns speed config with 9 speeds for H7142', () => {
    const speed = getSpeedConfig('H7142');
    expect(speed).toBeDefined();
    expect(speed!.maxSpeed).toBe(9);
  });

  it('returns speed config for purifier', () => {
    const speed = getSpeedConfig('H7120');
    expect(speed).toBeDefined();
    expect(speed!.maxSpeed).toBe(4);
  });

  it('returns undefined for unknown model', () => {
    expect(getSpeedConfig('HZZZZ')).toBeUndefined();
  });

  it('speed configs have valid values starting with 0', () => {
    for (const model of getAllModels()) {
      const speed = getSpeedConfig(model);
      if (speed?.validValues) {
        expect(speed.validValues[0]).toBe(0);
      }
    }
  });
});

describe('getAllModels', () => {
  it('returns a non-empty array', () => {
    const models = getAllModels();
    expect(models.length).toBeGreaterThan(0);
  });

  it('contains known models', () => {
    const models = getAllModels();
    expect(models).toContain('H7140');
    expect(models).toContain('H7122');
    expect(models).toContain('H7120');
  });

  it('has no duplicates', () => {
    const models = getAllModels();
    const unique = new Set(models);
    expect(unique.size).toBe(models.length);
  });
});

describe('getModelsByCategory', () => {
  it('returns humidifier models', () => {
    const models = getModelsByCategory('humidifier');
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('H7140');
    expect(models).toContain('H7142');
  });

  it('returns purifier models', () => {
    const models = getModelsByCategory('purifier');
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('H7120');
    expect(models).toContain('H7122');
  });

  it('returns empty array for unknown category', () => {
    expect(getModelsByCategory('nonexistent')).toEqual([]);
  });

  it('all models in a category share the same category', () => {
    for (const category of ['humidifier', 'purifier']) {
      const models = getModelsByCategory(category);
      for (const model of models) {
        const def = getDeviceDefinition(model);
        expect(def!.category).toBe(category);
      }
    }
  });
});

describe('deviceCatalog integrity', () => {
  it('all entries have required fields', () => {
    for (const [key, def] of deviceCatalog) {
      expect(def.model).toBeTruthy();
      expect(def.name).toBeTruthy();
      expect(def.category).toBeTruthy();
      expect(def.capabilities).toBeDefined();
      expect(def.services.length).toBeGreaterThan(0);
      // Key matches model (uppercased)
      expect(key).toBe(def.model.toUpperCase());
    }
  });

  it('all speed configs have codes for each level', () => {
    for (const [, def] of deviceCatalog) {
      const speed = def.capabilities.speed;
      if (speed) {
        const codeKeys = Object.keys(speed.codes).map(Number);
        expect(codeKeys.length).toBeGreaterThan(0);
      }
    }
  });
});
