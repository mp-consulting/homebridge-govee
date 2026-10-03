import { describe, expect, it, vi } from 'vitest';

import { SensorMonitorDevice } from '../../src/device/sensor-monitor.js';
import { SensorThermoDevice } from '../../src/device/sensor-thermo.js';
import { createAccessory, createPlatform, hap } from '../helpers/hap.js';

const { Characteristic, Service } = hap;

function setup<T extends SensorThermoDevice | SensorMonitorDevice>(
  DeviceClass: new (...args: never[]) => T,
) {
  const platform = createPlatform();
  const accessory = createAccessory({ gvModel: 'H5179' });
  const device = new DeviceClass(...([platform, accessory] as never[]));
  device.init();
  const value = (service: typeof Service.TemperatureSensor, characteristic: typeof Characteristic.CurrentTemperature) =>
    accessory.getService(service)!.getCharacteristic(characteristic).value;
  return { platform, accessory, device, value };
}

describe.each([
  ['SensorThermoDevice', SensorThermoDevice],
  ['SensorMonitorDevice', SensorMonitorDevice],
] as const)('%s', (_name, DeviceClass) => {
  it('makes the temperature service primary, not the humidity service', () => {
    const { accessory } = setup(DeviceClass as never);

    expect(accessory.getService(Service.TemperatureSensor)!.isPrimaryService).toBe(true);
    expect(accessory.getService(Service.HumiditySensor)!.isPrimaryService).toBe(false);
  });
});

describe('SensorThermoDevice', () => {
  it('applies readings in hundredths', async () => {
    const { device, value } = setup(SensorThermoDevice);

    await device.externalUpdate({ source: 'HTTP', temperature: 2213, humidity: 5170, battery: 15 });

    // HAP rounds to each characteristic's step: 0.1°C and 1%
    expect(value(Service.TemperatureSensor, Characteristic.CurrentTemperature)).toBeCloseTo(22.1);
    expect(value(Service.HumiditySensor, Characteristic.CurrentRelativeHumidity)).toBe(52);
    expect(value(Service.Battery, Characteristic.BatteryLevel)).toBe(15);
    expect(value(Service.Battery, Characteristic.StatusLowBattery)).toBe(1);
  });

  it('prefers BLE readings over HTTP ones for a while', async () => {
    const { device, value } = setup(SensorThermoDevice);

    await device.externalUpdate({ source: 'BLE', temperature: 2000 });
    await device.externalUpdate({ source: 'HTTP', temperature: 2500 });

    expect(value(Service.TemperatureSensor, Characteristic.CurrentTemperature)).toBe(20);
  });

  it('clears its BLE preference timer on destroy', async () => {
    vi.useFakeTimers();
    try {
      const { device } = setup(SensorThermoDevice);
      // hap-nodejs keeps timers of its own, so compare against the count before the update
      const baseline = vi.getTimerCount();
      await device.externalUpdate({ source: 'BLE', temperature: 2000 });
      expect(vi.getTimerCount()).toBe(baseline + 1);

      device.destroy();

      expect(vi.getTimerCount()).toBe(baseline);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('SensorMonitorDevice', () => {
  it('applies direct HTTP readings (hundredths) to temperature, humidity, and PM2.5', () => {
    const { device, value } = setup(SensorMonitorDevice);

    device.externalUpdate({ source: 'HTTP', temperature: 2410, humidity: 4870, pm25: 6, online: true });

    expect(value(Service.TemperatureSensor, Characteristic.CurrentTemperature)).toBeCloseTo(24.1);
    expect(value(Service.HumiditySensor, Characteristic.CurrentRelativeHumidity)).toBe(49);
    expect(value(Service.AirQualitySensor, Characteristic.PM2_5Density)).toBe(6);
    expect(value(Service.AirQualitySensor, Characteristic.AirQuality)).toBe(1);
  });

  it('does not notify HomeKit when HTTP readings are unchanged', () => {
    const { accessory, device } = setup(SensorMonitorDevice);
    device.externalUpdate({ source: 'HTTP', temperature: 2410, humidity: 4870, pm25: 6 });
    const changes = vi.fn();
    for (const service of accessory.services) {
      service.on('characteristic-change' as never, changes as never);
    }

    device.externalUpdate({ source: 'HTTP', temperature: 2410, humidity: 4870, pm25: 6 });

    expect(changes).not.toHaveBeenCalled();
  });
});
