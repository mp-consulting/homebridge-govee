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
    updateCharacteristic: vi.fn(),
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

  it('applies direct HTTP readings (hundredths) to temperature, humidity, and PM2.5', () => {
    const { platform, accessory, services } = createMocks();
    const device = new SensorMonitorDevice(platform as any, accessory as any);
    device.init();

    device.externalUpdate({ source: 'HTTP', temperature: 2410, humidity: 4870, pm25: 6, online: true });

    expect(services.get('TemperatureSensor')!.updateCharacteristic)
      .toHaveBeenCalledWith('CurrentTemperature', 24.1);
    expect(services.get('HumiditySensor')!.updateCharacteristic)
      .toHaveBeenCalledWith('CurrentRelativeHumidity', 49);
    expect(services.get('AirQualitySensor')!.updateCharacteristic)
      .toHaveBeenCalledWith('PM2_5Density', 6);
    expect(services.get('AirQualitySensor')!.updateCharacteristic)
      .toHaveBeenCalledWith('AirQuality', 1);
  });

  it('does not update characteristics when HTTP readings are unchanged', () => {
    const { platform, accessory, services } = createMocks();
    const device = new SensorMonitorDevice(platform as any, accessory as any);
    device.init();

    device.externalUpdate({ source: 'HTTP', temperature: 2410, humidity: 4870, pm25: 6 });
    services.get('TemperatureSensor')!.updateCharacteristic.mockClear();
    services.get('HumiditySensor')!.updateCharacteristic.mockClear();
    services.get('AirQualitySensor')!.updateCharacteristic.mockClear();

    device.externalUpdate({ source: 'HTTP', temperature: 2410, humidity: 4870, pm25: 6 });

    expect(services.get('TemperatureSensor')!.updateCharacteristic).not.toHaveBeenCalled();
    expect(services.get('HumiditySensor')!.updateCharacteristic).not.toHaveBeenCalled();
    expect(services.get('AirQualitySensor')!.updateCharacteristic).not.toHaveBeenCalled();
  });
});
