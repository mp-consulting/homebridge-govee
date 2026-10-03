import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import PQueue from 'p-queue';
import { describe, expect, it, vi } from 'vitest';

import HTTPClient from '../src/connection/http.js';
import { GoveePlatform } from '../src/platform.js';
import platformLang from '../src/utils/lang-en.js';
import { createAccessory, createApi, createLog, hap } from './helpers/hap.js';

type Internals = Record<string, unknown> & {
  devicesInHB: Map<string, unknown>;
  queue: PQueue;
};

function createTestPlatform(config: Record<string, unknown> = {}) {
  const api = createApi();
  const log = createLog();
  const platform = new GoveePlatform(log as never, { platform: 'Govee', ...config } as never, api as never);
  const internals = platform as unknown as Internals;
  internals.queue = new PQueue({ concurrency: 1 });
  return { platform, internals, api, log };
}

let deviceCounter = 0;

// Registers the accessory under the UUID the platform derives from its device id
function addDevice(internals: Internals, context: Record<string, unknown>, externalUpdate = vi.fn()) {
  const gvDeviceId = (context.gvDeviceId as string) ?? `AA:BB:CC:DD:EE:FF:00:${(++deviceCounter).toString(16).padStart(2, '0')}`;
  const accessory = createAccessory({ ...context, gvDeviceId });
  accessory.control = { externalUpdate } as never;
  internals.devicesInHB.set(hap.uuid.generate(gvDeviceId), accessory);
  return { accessory, externalUpdate };
}

function fakeClients(internals: Internals, opts: { lan?: boolean; aws?: boolean; ble?: boolean } = {}) {
  const lan = { updateDevice: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
  const aws = { updateDevice: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn() };
  const ble = { updateDevice: vi.fn().mockResolvedValue(undefined), shutdown: vi.fn() };
  internals.lanClient = opts.lan ? lan : false;
  internals.awsClient = opts.aws ? aws : false;
  internals.bleClient = opts.ble ? ble : false;
  return { lan, aws, ble };
}

describe('GoveePlatform.receiveDeviceUpdate', () => {
  it('forwards brightness, colour and opcode updates from AWS, not just on/off', () => {
    const { platform, internals } = createTestPlatform();
    const { externalUpdate } = addDevice(internals, { gvDeviceId: 'AA:BB:CC:DD:EE:FF:00:11', gvModel: 'H6008' });

    platform.receiveUpdateAWS({
      device: 'AA:BB:CC:DD:EE:FF:00:11',
      state: { onOff: 1, brightness: 30, color: { r: 1, g: 2, b: 3 }, colorTemInKelvin: 0 },
      op: { command: ['qhIBAA=='] },
    });

    expect(externalUpdate).toHaveBeenCalledWith({
      source: 'AWS',
      state: 'on',
      brightness: 30,
      rgb: { r: 1, g: 2, b: 3 },
      commands: ['qhIBAA=='],
    });
  });

  it('forwards LAN status replies, which carry onOff rather than state', () => {
    const { platform, internals } = createTestPlatform();
    const { externalUpdate } = addDevice(internals, { gvDeviceId: 'AA:BB:CC:DD:EE:FF:00:11' });

    platform.receiveUpdateLAN('AA:BB:CC:DD:EE:FF:00:11', { onOff: 0, brightness: 75 }, '192.168.1.20');

    expect(externalUpdate).toHaveBeenCalledWith({ source: 'LAN', state: 'off', brightness: 75 });
  });

  it('catches rejections from async handlers', async () => {
    const { platform, internals, log } = createTestPlatform();
    const { accessory } = addDevice(internals, {}, vi.fn().mockRejectedValue(new Error('boom')));

    platform.receiveDeviceUpdate(accessory, { source: 'HTTP', temperature: 2000 });
    await new Promise(resolve => setImmediate(resolve));

    expect(log.warn).toHaveBeenCalledWith('[%s] %s %s.', accessory.displayName, platformLang.devNotUpdated, expect.stringContaining('boom'));
  });
});

describe('GoveePlatform.sendDeviceUpdate', () => {
  it('prefers LAN, then AWS, then BLE', async () => {
    const { platform, internals } = createTestPlatform();
    const { lan, aws, ble } = fakeClients(internals, { lan: true, aws: true, ble: true });
    const { accessory } = addDevice(internals, { useLanControl: true, useAwsControl: true, useBleControl: true });

    await platform.sendDeviceUpdate(accessory, { cmd: 'state', value: 'on' });
    expect(lan.updateDevice).toHaveBeenCalledWith(accessory, { cmd: 'turn', data: { value: 1 } });
    expect(aws.updateDevice).not.toHaveBeenCalled();

    lan.updateDevice.mockRejectedValueOnce(new Error('lan down'));
    await platform.sendDeviceUpdate(accessory, { cmd: 'state', value: 'off' });
    expect(aws.updateDevice).toHaveBeenCalledWith(accessory, { cmd: 'turn', data: { val: 0 } });

    lan.updateDevice.mockRejectedValueOnce(new Error('lan down'));
    aws.updateDevice.mockRejectedValueOnce(new Error('aws down'));
    await platform.sendDeviceUpdate(accessory, { cmd: 'state', value: 'on' });
    expect(ble.updateDevice).toHaveBeenCalledWith(accessory, { cmd: 0x01, data: 0x1 });
  });

  it('fails instead of reporting success when a command has no transport', async () => {
    const { platform, internals } = createTestPlatform();
    fakeClients(internals);
    const { accessory } = addDevice(internals, {});

    await expect(platform.sendDeviceUpdate(accessory, { cmd: 'stateOutlet', value: 'on' })).rejects.toThrow(platformLang.noConnMethod);
  });

  it('honours the per-device AWS brightness and colour settings', async () => {
    const { platform, internals } = createTestPlatform();
    const { aws } = fakeClients(internals, { aws: true });
    const { accessory } = addDevice(internals, { gvDeviceId: 'AA:BB:CC:DD:EE:FF:00:11', useAwsControl: true });
    platform.deviceConf['AA:BB:CC:DD:EE:FF:00:11'] = { awsBrightnessNoScale: true, awsColourMode: 'redgreenblue' };

    await platform.sendDeviceUpdate(accessory, { cmd: 'brightness', value: 40 });
    await platform.sendDeviceUpdate(accessory, { cmd: 'color', value: { r: 1, g: 2, b: 3 } });

    expect(aws.updateDevice).toHaveBeenNthCalledWith(1, accessory, { cmd: 'brightness', data: { val: 40 } });
    expect(aws.updateDevice).toHaveBeenNthCalledWith(2, accessory, { cmd: 'color', data: { red: 1, green: 2, blue: 3 } });
  });

  it('scales BLE brightness except for models that take a percentage', async () => {
    const { platform, internals } = createTestPlatform();
    const { ble } = fakeClients(internals, { ble: true });
    const scaled = addDevice(internals, { gvModel: 'H6008', useBleControl: true }).accessory;
    const percent = addDevice(internals, { gvModel: 'H6052', useBleControl: true }).accessory;

    await platform.sendDeviceUpdate(scaled, { cmd: 'brightness', value: 50 });
    await platform.sendDeviceUpdate(percent, { cmd: 'brightness', value: 50 });

    expect(ble.updateDevice.mock.calls.map(call => call[1])).toEqual([
      { cmd: 0x04, data: 127 },
      { cmd: 0x04, data: 50 },
    ]);
  });

  it('collapses queued BLE commands of the same kind to the latest', async () => {
    const { platform, internals } = createTestPlatform();
    const { ble } = fakeClients(internals, { ble: true });
    const { accessory } = addDevice(internals, { useBleControl: true });
    internals.queue.pause();

    const sends = [10, 20, 30].map(value => platform.sendDeviceUpdate(accessory, { cmd: 'brightness', value }));
    const ptReal = [platform.sendDeviceUpdate(accessory, { cmd: 'ptReal', value: 'MwUBAA==' }),
      platform.sendDeviceUpdate(accessory, { cmd: 'ptReal', value: 'MwUCAA==' })];
    internals.queue.start();
    await Promise.all([...sends, ...ptReal]);

    const sent = ble.updateDevice.mock.calls.map(call => call[1]);
    expect(sent.filter(p => p.cmd === 0x04)).toEqual([{ cmd: 0x04, data: Math.floor(0.3 * 0xff) }]);
    // Generic opcode commands are never dropped
    expect(sent.filter(p => p.cmd === 'ptReal')).toHaveLength(2);
  });
});

describe('GoveePlatform BLE sensor readings', () => {
  it('converts readings to hundredths and throttles repeats', () => {
    const { platform, internals } = createTestPlatform();
    const { externalUpdate } = addDevice(internals, { gvModel: 'H5075', bleAddress: 'a4:c1:38:00:00:01' });
    const reading = { uuid: 'x', address: 'A4:C1:38:00:00:01', model: 'GVH5075', battery: 87, tempInC: 21.37, tempInF: 70.5, humidity: 45.6, rssi: -60 };

    platform.receiveBLEReading(reading);
    platform.receiveBLEReading(reading);

    expect(externalUpdate).toHaveBeenCalledTimes(1);
    expect(externalUpdate).toHaveBeenCalledWith({ source: 'BLE', battery: 87, temperature: 2137, humidity: 4560 });
  });

  it('ignores readings for devices that are not BLE sensors', () => {
    const { platform, internals } = createTestPlatform();
    const { externalUpdate } = addDevice(internals, { gvModel: 'H6008', bleAddress: 'a4:c1:38:00:00:02' });

    platform.receiveBLEReading({ uuid: 'x', address: 'a4:c1:38:00:00:02', model: '', battery: 1, tempInC: 1, tempInF: 1, humidity: 1, rssi: 0 });

    expect(externalUpdate).not.toHaveBeenCalled();
  });
});

describe('GoveePlatform.pluginShutdown', () => {
  it('disconnects AWS and keeps tearing down after a failing step', () => {
    const { platform, internals } = createTestPlatform();
    const { lan, aws, ble } = fakeClients(internals, { lan: true, aws: true, ble: true });
    lan.close.mockImplementation(() => {
      throw new Error('not bound');
    });

    platform.pluginShutdown();

    expect(aws.disconnect).toHaveBeenCalled();
    expect(ble.shutdown).toHaveBeenCalled();
  });
});

describe('GoveePlatform credentials', () => {
  it('logs in again when the cached token is rejected', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'govee-test-'));
    try {
      const { platform, internals } = createTestPlatform({ username: 'user@example.com', password: 'pw', awsDisable: true });
      const storage = new Map<string, string>([
        ['Govee_All_Devices_temp', 'topic:::old-token:::user@example.com:::acc:::endpoint:::pass:::'],
      ]);
      await writeFile(join(dir, 'govee.pfx'), 'cert');
      internals.storageClientData = true;
      internals.storageData = {
        getItem: async (key: string) => storage.get(key),
        setItem: async (key: string, value: string) => void storage.set(key, value),
        removeItem: async (key: string) => void storage.delete(key),
      };
      const login = vi.spyOn(HTTPClient.prototype, 'login').mockResolvedValue({
        accountId: 'acc', topic: 'topic', token: 'new-token', endpoint: 'e', iotPass: 'p', iot: '', client: 'c',
      });
      const getDevices = vi.spyOn(HTTPClient.prototype, 'getDevices')
        .mockRejectedValueOnce(Object.assign(new Error('Request failed'), { response: { status: 401 } }))
        .mockResolvedValueOnce([]);
      const proto = GoveePlatform.prototype as unknown as Record<string, (...args: unknown[]) => Promise<void>>;

      await proto.setupHTTPAndAWSClients.call(platform, dir);

      expect(login).toHaveBeenCalledTimes(1);
      expect(getDevices).toHaveBeenCalledTimes(2);
      expect(storage.get('Govee_All_Devices_temp')).toContain('new-token');
      expect(internals.httpClient).not.toBe(false);
    } finally {
      vi.restoreAllMocks();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('GoveePlatform config', () => {
  it('reads device settings for every device type', () => {
    const types = ['lightDevices', 'switchDevices', 'leakDevices', 'thermoDevices', 'fanDevices', 'heaterDevices',
      'humidifierDevices', 'dehumidifierDevices', 'purifierDevices', 'diffuserDevices', 'kettleDevices', 'iceMakerDevices'];
    const config = Object.fromEntries(types.map((type, i) => [type, [{
      deviceId: `AA:BB:CC:DD:EE:FF:00:${i.toString(16).padStart(2, '0')}`,
      label: type,
      ignoreDevice: true,
    }]]));

    const { platform } = createTestPlatform(config);

    expect(Object.values(platform.deviceConf).map(conf => conf.label).sort()).toEqual([...types].sort());
    expect(platform.ignoredDevices).toHaveLength(types.length);
  });
});

describe('GoveePlatform model-specific commands', () => {
  it('uses the channel-1 codes for outlets that need them over AWS', async () => {
    const { platform, internals } = createTestPlatform();
    const { aws } = fakeClients(internals, { aws: true });
    const legacy = addDevice(internals, { gvModel: 'H5080', useAwsControl: true }).accessory;
    const modern = addDevice(internals, { gvModel: 'H5001', useAwsControl: true }).accessory;

    await platform.sendDeviceUpdate(legacy, { cmd: 'stateOutlet', value: 'on' });
    await platform.sendDeviceUpdate(modern, { cmd: 'stateOutlet', value: 'on' });

    expect(aws.updateDevice.mock.calls.map(call => call[1].data)).toEqual([{ val: 17 }, { val: 1 }]);
  });

  it.each([
    ['H6008', [0x02, 1, 2, 3]],
    ['H6005', [0x0d, 1, 2, 3]],
    ['H6199', [0x15, 0x01, 1, 2, 3, 0, 0, 0, 0, 0, 0xff, 0x7f]],
  ])('sends the %s BLE colour command shape', async (model, data) => {
    const { platform, internals } = createTestPlatform();
    const { ble } = fakeClients(internals, { ble: true });
    const { accessory } = addDevice(internals, { gvModel: model, useBleControl: true });

    await platform.sendDeviceUpdate(accessory, { cmd: 'color', value: { r: 1, g: 2, b: 3 } });

    expect(ble.updateDevice).toHaveBeenCalledWith(accessory, { cmd: 0x05, data });
  });

  it('skips Matter-capable models when ignoreMatter is set', () => {
    const { internals } = createTestPlatform({ ignoreMatter: true });
    const isIgnored = internals.isIgnored as (id: string, model?: string) => boolean;

    expect(isIgnored.call(internals, 'AA:BB:CC:DD:EE:FF:00:01', 'H6022')).toBe(true);
    expect(isIgnored.call(internals, 'AA:BB:CC:DD:EE:FF:00:01', 'H6008')).toBe(false);
  });
});
