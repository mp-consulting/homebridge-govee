import { describe, it, expect, vi } from 'vitest';
import { GoveePlatform } from '../src/platform.js';

function createAccessory() {
  return {
    displayName: 'Test Sensor',
    context: {},
    logDebug: vi.fn(),
  };
}

function createPlatformMock(devices: unknown[], accessoryIds: string[] = []) {
  const devicesInHB = new Map<string, ReturnType<typeof createAccessory>>();
  for (const id of accessoryIds) {
    devicesInHB.set(`uuid-${id}`, createAccessory());
  }
  return {
    httpClient: {
      getDevices: vi.fn().mockResolvedValue(devices),
      getLeakDeviceWarning: vi.fn().mockResolvedValue([]),
    },
    httpSyncInProgress: false,
    devicesInHB,
    api: { hap: { uuid: { generate: (id: string) => `uuid-${id}` } } },
    log: { debug: vi.fn(), warn: vi.fn() },
    receiveDeviceUpdate: vi.fn(),
  };
}

const sync = GoveePlatform.prototype.goveeHTTPSync;

describe('goveeHTTPSync', () => {
  it('passes thermo sensor readings from lastDeviceData to receiveDeviceUpdate', async () => {
    const platform = createPlatformMock([{
      device: 'F9:44:AB:CD:12:34:56:78',
      sku: 'H5103',
      deviceName: 'Wifi Thermometer',
      deviceExt: {
        deviceSettings: JSON.stringify({ battery: 94 }),
        lastDeviceData: JSON.stringify({ tem: 2213, hum: 5170, online: true }),
      },
    }], ['F9:44:AB:CD:12:34:56:78']);

    await sync.call(platform);

    expect(platform.receiveDeviceUpdate).toHaveBeenCalledTimes(1);
    const [accessory, params] = platform.receiveDeviceUpdate.mock.calls[0];
    expect(accessory).toBe(platform.devicesInHB.get('uuid-F9:44:AB:CD:12:34:56:78'));
    expect(params).toEqual({
      source: 'HTTP',
      battery: 94,
      temperature: 2213,
      humidity: 5170,
      online: true,
    });
  });

  it('normalises bare device IDs before matching accessories', async () => {
    const platform = createPlatformMock([{
      device: 'ab12cd34ef56ab78',
      sku: 'H5103',
      deviceName: 'Bare ID Thermometer',
      deviceExt: {
        deviceSettings: JSON.stringify({ battery: 50 }),
        lastDeviceData: JSON.stringify({ tem: 1000, hum: 4000 }),
      },
    }], ['AB:12:CD:34:EF:56:AB:78']);

    await sync.call(platform);

    expect(platform.receiveDeviceUpdate).toHaveBeenCalledTimes(1);
  });

  it('skips devices without deviceExt data', async () => {
    const platform = createPlatformMock([{
      device: 'F9:44:AB:CD:12:34:56:78',
      sku: 'H5103',
      deviceName: 'No Data Thermometer',
    }], ['F9:44:AB:CD:12:34:56:78']);

    await sync.call(platform);

    expect(platform.receiveDeviceUpdate).not.toHaveBeenCalled();
  });

  it('ignores models that are not leak or thermo sensors', async () => {
    const platform = createPlatformMock([{
      device: 'F9:44:AB:CD:12:34:56:78',
      sku: 'H6003',
      deviceName: 'Light Bulb',
      deviceExt: {
        deviceSettings: JSON.stringify({ battery: 94 }),
        lastDeviceData: JSON.stringify({ tem: 2213 }),
      },
    }], ['F9:44:AB:CD:12:34:56:78']);

    await sync.call(platform);

    expect(platform.httpClient.getDevices).toHaveBeenCalled();
    expect(platform.receiveDeviceUpdate).not.toHaveBeenCalled();
  });

  it('reports leak sensor battery and no leak when no warnings exist', async () => {
    const platform = createPlatformMock([{
      device: 'A1:B2:C3:D4:E5:F6:A7:B8',
      sku: 'H5054',
      deviceName: 'Leak Sensor',
      deviceExt: {
        deviceSettings: JSON.stringify({ battery: 80 }),
        lastDeviceData: JSON.stringify({ lastTime: 0, online: true, gwonline: true }),
      },
    }], ['A1:B2:C3:D4:E5:F6:A7:B8']);

    await sync.call(platform);

    expect(platform.httpClient.getLeakDeviceWarning).not.toHaveBeenCalled();
    const [, params] = platform.receiveDeviceUpdate.mock.calls[0];
    expect(params).toEqual({
      source: 'HTTP',
      battery: 80,
      leakDetected: false,
      online: true,
    });
  });

  it('filters out 65535 sentinel readings (e.g. H5310 with no humidity sensor)', async () => {
    const platform = createPlatformMock([{
      device: '03:55:01:25:00:00:00:0E:FF:FF:00:4F:FF:FF:00:3B',
      sku: 'H5310',
      deviceName: 'Pool Temp',
      deviceExt: {
        deviceSettings: JSON.stringify({ battery: 100 }),
        lastDeviceData: JSON.stringify({ tem: 2850, hum: 65535, online: true }),
      },
    }], ['03:55:01:25:00:00:00:0E:FF:FF:00:4F:FF:FF:00:3B']);

    await sync.call(platform);

    const [, params] = platform.receiveDeviceUpdate.mock.calls[0];
    expect(params).toEqual({
      source: 'HTTP',
      battery: 100,
      temperature: 2850,
      online: true,
    });
    expect(params).not.toHaveProperty('humidity');
  });

  it('includes air quality monitors and passes pm25 readings', async () => {
    const platform = createPlatformMock([{
      device: 'AA:BB:CC:DD:EE:FF:00:11',
      sku: 'H5106',
      deviceName: 'Air Monitor',
      deviceExt: {
        deviceSettings: JSON.stringify({}),
        lastDeviceData: JSON.stringify({ tem: 2410, hum: 4870, pm25: 6, online: true }),
      },
    }], ['AA:BB:CC:DD:EE:FF:00:11']);

    await sync.call(platform);

    expect(platform.receiveDeviceUpdate).toHaveBeenCalledTimes(1);
    const [, params] = platform.receiveDeviceUpdate.mock.calls[0];
    expect(params).toEqual({
      source: 'HTTP',
      temperature: 2410,
      humidity: 4870,
      pm25: 6,
      online: true,
    });
  });

  it('does not run concurrent syncs', async () => {
    const platform = createPlatformMock([]);
    platform.httpSyncInProgress = true;

    await sync.call(platform);

    expect(platform.httpClient.getDevices).not.toHaveBeenCalled();
  });
});
