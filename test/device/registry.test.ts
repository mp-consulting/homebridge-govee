import { describe, it, expect, beforeAll } from 'vitest';
import {
  registerDeviceHandler,
  registerModelHandler,
  getCategoryForModel,
  getDeviceHandler,
  getDeviceHandlerForModel,
  isModelSupported,
  getRegisteredCategories,
  initializeModelMappings,
  getModelDefinition,
  modelHasCapability,
  getModelSpeedConfig,
} from '../../src/device/registry.js';
import type { DeviceHandlerClass } from '../../src/device/registry.js';

// Initialize the model mappings once before all tests
beforeAll(() => {
  initializeModelMappings();
});

describe('initializeModelMappings', () => {
  it('registers RGB light models', () => {
    expect(isModelSupported('H6001')).toBe(true);
    expect(isModelSupported('H6002')).toBe(true);
  });

  it('registers switch models', () => {
    expect(isModelSupported('H5001')).toBe(true);
    expect(isModelSupported('H5080')).toBe(true);
  });

  it('registers sensor models', () => {
    expect(isModelSupported('H5074')).toBe(true);
    expect(isModelSupported('H5075')).toBe(true);
    expect(isModelSupported('H5179')).toBe(true);
  });

  it('registers fan models', () => {
    expect(isModelSupported('H7102')).toBe(true);
  });

  it('registers heater models', () => {
    expect(isModelSupported('H7130')).toBe(true);
    expect(isModelSupported('H7131')).toBe(true);
  });

  it('registers humidifier models', () => {
    expect(isModelSupported('H7140')).toBe(true);
    expect(isModelSupported('H7142')).toBe(true);
  });

  it('registers purifier models', () => {
    expect(isModelSupported('H7120')).toBe(true);
    expect(isModelSupported('H7122')).toBe(true);
  });

  it('registers kettle models', () => {
    expect(isModelSupported('H7170')).toBe(true);
  });

  it('registers ice maker models', () => {
    expect(isModelSupported('H7172')).toBe(true);
  });
});

describe('isModelSupported', () => {
  it('is case-insensitive', () => {
    expect(isModelSupported('h6001')).toBe(true);
    expect(isModelSupported('H6001')).toBe(true);
  });

  it('returns false for unknown models', () => {
    expect(isModelSupported('HZZZZ')).toBe(false);
    expect(isModelSupported('')).toBe(false);
  });
});

describe('getCategoryForModel', () => {
  it('returns correct category for lights', () => {
    expect(getCategoryForModel('H6001')).toBe('light');
  });

  it('returns correct category for switches', () => {
    expect(getCategoryForModel('H5001')).toBe('switchSingle');
    expect(getCategoryForModel('H5082')).toBe('switchDouble');
    expect(getCategoryForModel('H5160')).toBe('switchTriple');
  });

  it('returns correct category for sensors', () => {
    expect(getCategoryForModel('H5074')).toBe('sensorThermo');
    expect(getCategoryForModel('H5054')).toBe('sensorLeak');
    expect(getCategoryForModel('H5122')).toBe('sensorButton');
    expect(getCategoryForModel('H5123')).toBe('sensorContact');
    expect(getCategoryForModel('H5127')).toBe('sensorPresence');
  });

  it('returns correct category for fans', () => {
    expect(getCategoryForModel('H7102')).toBe('fan');
  });

  it('returns correct category for heaters', () => {
    // heater1 models
    expect(getCategoryForModel('H7130')).toBe('heater');
    // heater2 models also map to heater (overwritten by second registerModelsForCategory call)
    expect(getCategoryForModel('H7131')).toBe('heater');
  });

  it('returns correct category for humidifiers', () => {
    expect(getCategoryForModel('H7140')).toBe('humidifier');
  });

  it('returns correct category for purifiers', () => {
    expect(getCategoryForModel('H7120')).toBe('purifier');
  });

  it('is case-insensitive', () => {
    expect(getCategoryForModel('h7140')).toBe('humidifier');
  });

  it('returns undefined for unknown model', () => {
    expect(getCategoryForModel('HZZZZ')).toBeUndefined();
  });
});

describe('registerDeviceHandler / getDeviceHandler', () => {
  it('registers and retrieves a handler by category', () => {
    const mockHandler = class {} as unknown as DeviceHandlerClass;
    registerDeviceHandler('template', mockHandler);
    expect(getDeviceHandler('template')).toBe(mockHandler);
  });

  it('returns undefined for unregistered category', () => {
    expect(getDeviceHandler('tv')).toBeUndefined();
  });
});

describe('registerModelHandler / getDeviceHandlerForModel', () => {
  it('model-specific handler takes priority over category handler', () => {
    const categoryHandler = class {} as unknown as DeviceHandlerClass;
    const modelHandler = class {} as unknown as DeviceHandlerClass;

    registerDeviceHandler('template', categoryHandler);
    registerModelHandler('HXXXX', modelHandler);

    expect(getDeviceHandlerForModel('HXXXX')).toBe(modelHandler);
  });

  it('falls back to category handler when no model handler exists', () => {
    const categoryHandler = class {} as unknown as DeviceHandlerClass;
    registerDeviceHandler('template', categoryHandler);

    // A template model without a specific model handler
    expect(getDeviceHandlerForModel('H1162')).toBe(categoryHandler);
  });

  it('returns undefined for completely unknown model', () => {
    expect(getDeviceHandlerForModel('HABCD')).toBeUndefined();
  });
});

describe('getModelDefinition', () => {
  it('returns definition for models in the catalog', () => {
    const def = getModelDefinition('H7140');
    expect(def).toBeDefined();
    expect(def!.model).toBe('H7140');
  });

  it('returns undefined for models not in the catalog', () => {
    // H6001 is a light — it's in the registry but not in the device catalog
    expect(getModelDefinition('H6001')).toBeUndefined();
  });
});

describe('modelHasCapability', () => {
  it('returns true for existing capabilities', () => {
    expect(modelHasCapability('H7140', 'onOff')).toBe(true);
    expect(modelHasCapability('H7140', 'speed')).toBe(true);
  });

  it('returns false for missing capabilities', () => {
    expect(modelHasCapability('H7140', 'airQuality')).toBe(false);
  });

  it('returns false for unknown model', () => {
    expect(modelHasCapability('HZZZZ', 'onOff')).toBe(false);
  });
});

describe('getModelSpeedConfig', () => {
  it('returns speed config for known model', () => {
    const speed = getModelSpeedConfig('H7140');
    expect(speed).toBeDefined();
    expect(speed!.maxSpeed).toBe(8);
  });

  it('returns undefined for model without speed', () => {
    expect(getModelSpeedConfig('HZZZZ')).toBeUndefined();
  });
});

describe('getRegisteredCategories', () => {
  it('returns an array of registered categories', () => {
    const categories = getRegisteredCategories();
    expect(Array.isArray(categories)).toBe(true);
    // After registerDeviceHandler('template', ...) above, at minimum template is registered
    expect(categories).toContain('template');
  });
});
