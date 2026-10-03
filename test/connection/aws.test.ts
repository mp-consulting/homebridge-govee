import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeIotDevice extends EventEmitter {
  static instances: FakeIotDevice[] = [];
  publish = vi.fn();
  subscribe = vi.fn();
  end = vi.fn();
}

let device: FakeIotDevice;
vi.mock('aws-iot-device-sdk', () => ({
  device: class extends FakeIotDevice {
    constructor() {
      super();
      FakeIotDevice.instances.push(this);
    }
  },
}));

const { default: AWSClient } = await import('../../src/connection/aws.js');
const { createAccessory, createLog } = await import('../helpers/hap.js');

function createClient() {
  const client = new AWSClient({
    accountTopic: 'topic',
    accountId: 'acc',
    clientId: 'client',
    iotEndpoint: 'endpoint',
    log: createLog(),
    receiveUpdateAWS: vi.fn(),
  } as never, { cert: 'cert', key: 'key' } as never);
  device = FakeIotDevice.instances.at(-1)!;
  device.emit('connect');
  return client;
}

describe('AWSClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes commands to the device topic', async () => {
    const client = createClient();
    device.publish.mockImplementation((_topic, _msg, _opts, cb) => cb());
    const accessory = createAccessory({ awsTopic: 'device-topic' });

    await client.updateDevice(accessory, { cmd: 'turn', data: { val: 1 } });

    const [topic, message] = device.publish.mock.calls[0];
    expect(topic).toBe('device-topic');
    expect(JSON.parse(message).msg).toMatchObject({ cmd: 'turn', data: { val: 1 }, accountTopic: 'topic' });
  });

  it('fails a publish the broker never acknowledges, so the caller can fall back', async () => {
    vi.useFakeTimers();
    const client = createClient();
    const accessory = createAccessory({ awsTopic: 'device-topic' });

    const result = client.updateDevice(accessory, { cmd: 'turn', data: { val: 1 } }).catch((err: Error) => err);
    await vi.advanceTimersByTimeAsync(5000);

    expect(await result).toBeInstanceOf(Error);
  });

  it('refuses to publish while disconnected', async () => {
    const client = createClient();
    device.emit('offline');

    await expect(client.updateDevice(createAccessory({ awsTopic: 't' }), { cmd: 'turn', data: {} })).rejects.toThrow();
    expect(device.publish).not.toHaveBeenCalled();
  });
});
