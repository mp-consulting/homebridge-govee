import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sockets: FakeSocket[] = [];

class FakeSocket extends EventEmitter {
  send = vi.fn();
  bind = vi.fn((_port?: number, cb?: () => void) => cb?.());
  addMembership = vi.fn();
  address = () => ({ address: '0.0.0.0', port: 4002 });
  close = vi.fn();
}

vi.mock('node:dgram', () => ({
  default: {
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  },
}));

const { default: LANClient, isLocalIPv4 } = await import('../../src/connection/lan.js');
const { createLog } = await import('../helpers/hap.js');

const DEVICE_ID = 'AA:BB:CC:DD:EE:FF:00:11';

function setup(deviceConf: Record<string, Record<string, unknown>> = {}) {
  sockets.length = 0;
  const platform = {
    log: createLog(),
    config: {},
    deviceConf,
    receiveUpdateLAN: vi.fn(),
  };
  const client = new LANClient(platform as never);
  const [receiver, sender] = sockets;
  return { client, platform, receiver, sender };
}

function packet(body: unknown): Buffer {
  return Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
}

function scanReply(device: string, extra: Record<string, unknown> = {}) {
  return packet({ msg: { cmd: 'scan', data: { device, sku: 'H6008', ...extra } } });
}

describe('isLocalIPv4', () => {
  it.each([
    ['192.168.1.20', true],
    ['10.0.0.5', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['169.254.10.10', true],
    ['172.32.0.1', false],
    ['8.8.8.8', false],
    ['127.0.0.1', false],
    ['not-an-ip', false],
    ['192.168.1.300', false],
  ])('%s -> %s', (address, expected) => {
    expect(isLocalIPv4(address)).toBe(expected);
  });
});

describe('LANClient message handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a newly discovered device at the packet source address, not the claimed one', () => {
    const { client, platform } = setup();

    client.handleMessage(scanReply(DEVICE_ID, { ip: '192.168.1.99' }), { address: '192.168.1.20' });

    expect(client.lanDevices).toEqual([{ device: DEVICE_ID, ip: '192.168.1.20', sku: 'H6008' }]);
    expect(platform.receiveUpdateLAN).toHaveBeenCalledWith(DEVICE_ID, {}, '192.168.1.20');
  });

  it('ignores scan replies with an invalid device id or from a non-local address', () => {
    const { client } = setup();

    client.handleMessage(scanReply('not-a-device'), { address: '192.168.1.20' });
    client.handleMessage(scanReply({ toString: 1 } as never), { address: '192.168.1.20' });
    client.handleMessage(scanReply(DEVICE_ID), { address: '8.8.8.8' });

    expect(client.lanDevices).toEqual([]);
  });

  it('caps the number of discovered devices', () => {
    const { client } = setup();

    for (let i = 0; i < 300; i++) {
      const id = `AA:BB:CC:DD:EE:FF:${(i >> 8).toString(16).padStart(2, '0')}:${(i & 0xff).toString(16).padStart(2, '0')}`;
      client.handleMessage(scanReply(id), { address: '192.168.1.20' });
    }

    expect(client.lanDevices).toHaveLength(256);
  });

  it('keeps the configured IP of a manual device', () => {
    const { client, platform } = setup({ [DEVICE_ID]: { customIPAddress: '192.168.5.5' } });

    client.handleMessage(scanReply(DEVICE_ID), { address: '192.168.1.66' });

    expect(client.lanDevices).toEqual([{ device: DEVICE_ID, ip: '192.168.5.5', sku: 'H6008', isManual: true }]);
    expect(platform.receiveUpdateLAN).toHaveBeenCalledWith(DEVICE_ID, {}, '192.168.5.5');

    // Later replies from elsewhere never move a manual device
    client.handleMessage(scanReply(DEVICE_ID), { address: '192.168.1.77' });
    expect(client.lanDevices[0].ip).toBe('192.168.5.5');
  });

  it('follows a discovered device to a new address', () => {
    const { client, platform } = setup();
    client.handleMessage(scanReply(DEVICE_ID), { address: '192.168.1.20' });

    client.handleMessage(scanReply(DEVICE_ID), { address: '192.168.1.21' });

    expect(client.lanDevices[0].ip).toBe('192.168.1.21');
    expect(platform.receiveUpdateLAN).toHaveBeenLastCalledWith(DEVICE_ID, {}, '192.168.1.21');
  });

  it('forwards status replies from a known device with their full payload', () => {
    const { client, platform } = setup();
    client.handleMessage(scanReply(DEVICE_ID), { address: '192.168.1.20' });
    const data = { onOff: 1, brightness: 50, color: { r: 1, g: 2, b: 3 }, colorTemInKelvin: 0 };

    client.handleMessage(packet({ msg: { cmd: 'devStatus', data } }), { address: '192.168.1.20' });

    expect(platform.receiveUpdateLAN).toHaveBeenLastCalledWith(DEVICE_ID, data, '192.168.1.20');
  });

  it('logs junk and unknown senders at debug level only', () => {
    const { client, platform } = setup();

    client.handleMessage(packet('x'.repeat(10000)), { address: '192.168.1.20' });
    client.handleMessage(packet({ msg: { cmd: 'devStatus', data: {} } }), { address: '192.168.1.50' });
    client.handleMessage(packet({ msg: { cmd: 'scan' } }), { address: '192.168.1.50' });

    expect(platform.log.warn).not.toHaveBeenCalled();
    expect(platform.log).not.toHaveBeenCalled();
    const logged = platform.log.debug.mock.calls.flat().join(' ');
    expect(logged.length).toBeLessThan(1000);
  });

  it('handles sender socket errors instead of letting them crash the process', () => {
    const { sender } = setup();

    expect(sender.listenerCount('error')).toBeGreaterThan(0);
    expect(() => sender.emit('error', new Error('ENETUNREACH'))).not.toThrow();
  });
});
