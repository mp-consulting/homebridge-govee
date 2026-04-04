import { describe, it, expect, vi } from 'vitest';
import { SensorThermoDevice } from '../../src/device/sensor-thermo.js';
import { SensorMonitorDevice } from '../../src/device/sensor-monitor.js';

// Helper to create a mock characteristic
function createMockCharacteristic(value: number = 0) {
  return { value, onGet: vi.fn().mockReturnThis(), onSet: vi.fn().mockReturnThis() };
}

// Helper to create a mock service
function createMockService() {
  const characteristics = new Map<string, ReturnType<typeof createMockCharacteristic>>();
  return {
    setPrimaryService: vi.fn(),
    addCharacteristic: vi.fn(),
    getCharacteristic: vi.fn((char: string) => {
      if (!characteristics.has(char)) {
        characteristics.set(char, createMockCharacteristic());
      }
      return characteristics.get(char)!;
    }),
  };
}

// Minimal mock platform and accessory for device handler construction
function createMocks() {
  const services = new Map<string, ReturnType<typeof createMockService>>();

  const accessory = {
    displayName: 'Test Sensor',
    context: { gvDeviceId: 'test-device-id' },
    getService: vi.fn((svc: string) => services.get(svc)),
    addService: vi.fn((svc: string) => {
      const mock = createMockService();
      services.set(svc, mock);
      return mock;
    }),
    removeService: vi.fn(),
    log: vi.fn(),
    logWarn: vi.fn(),
    eveService: null,
  };

  const platform = {
    api: {
      hap: {
        Characteristic: {
          CurrentTemperature: 'CurrentTemperature',
          CurrentRelativeHumidity: 'CurrentRelativeHumidity',
          BatteryLevel: 'BatteryLevel',
          StatusLowBattery: 'StatusLowBattery',
          PM2_5Density: 'PM2_5Density',
          AirQuality: 'AirQuality',
          TargetTemperature: 'TargetTemperature',
          CurrentHeatingCoolingState: 'CurrentHeatingCoolingState',
          TargetHeatingCoolingState: 'TargetHeatingCoolingState',
        },
        Service: {
          TemperatureSensor: 'TemperatureSensor',
          HumiditySensor: 'HumiditySensor',
          Battery: 'Battery',
          Thermostat: 'Thermostat',
          AirQualitySensor: 'AirQualitySensor',
        },
      },
    },
    config: {},
    deviceConf: { 'test-device-id': {} },
    log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    eveService: class {
      addEntry() {}
    },
    storageClientData: null,
  };

  return { platform, accessory, services };
}

describe('SensorThermoDevice', () => {
  it('sets TemperatureSensor as the primary service on init', () => {
    const { platform, accessory, services } = createMocks();
    const device = new SensorThermoDevice(platform as any, accessory as any);
    device.init();

    const tempService = services.get('TemperatureSensor');
    expect(tempService).toBeDefined();
    expect(tempService!.setPrimaryService).toHaveBeenCalledWith(true);
  });

  it('does not set HumiditySensor as primary', () => {
    const { platform, accessory, services } = createMocks();
    const device = new SensorThermoDevice(platform as any, accessory as any);
    device.init();

    const humiService = services.get('HumiditySensor');
    expect(humiService).toBeDefined();
    expect(humiService!.setPrimaryService).not.toHaveBeenCalled();
  });
});

describe('SensorMonitorDevice', () => {
  it('sets TemperatureSensor as the primary service on init', () => {
    const { platform, accessory, services } = createMocks();
    const device = new SensorMonitorDevice(platform as any, accessory as any);
    device.init();

    const tempService = services.get('TemperatureSensor');
    expect(tempService).toBeDefined();
    expect(tempService!.setPrimaryService).toHaveBeenCalledWith(true);
  });

  it('does not set HumiditySensor as primary', () => {
    const { platform, accessory, services } = createMocks();
    const device = new SensorMonitorDevice(platform as any, accessory as any);
    device.init();

    const humiService = services.get('HumiditySensor');
    expect(humiService).toBeDefined();
    expect(humiService!.setPrimaryService).not.toHaveBeenCalled();
  });
});
