import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeNoble extends EventEmitter {
  startScanningAsync = vi.fn(async () => {
    this.emit('scanStart');
  });
  stopScanningAsync = vi.fn(async () => {
    this.emit('scanStop');
  });
  stopScanning = vi.fn();
  waitForPoweredOnAsync = vi.fn(async () => {});
  connectAsync = vi.fn();
  reset = vi.fn();
}

const noble = new FakeNoble();
vi.mock('@stoprocent/noble', () => ({ default: noble }));

const { default: BLEClient } = await import('../../src/connection/ble.js');
const { createAccessory, createLog } = await import('../helpers/hap.js');

async function createClient() {
  noble.removeAllListeners();
  const client = new BLEClient({ log: createLog() } as never);
  // Listeners are attached after the dynamic noble import resolves
  await vi.waitFor(() => expect(noble.listenerCount('discover')).toBe(1));
  noble.emit('stateChange', 'poweredOn');
  return client;
}

function fakePeripheral(discover: () => Promise<unknown>) {
  return {
    discoverAllServicesAndCharacteristicsAsync: vi.fn(discover),
    disconnectAsync: vi.fn(async () => {}),
  };
}

describe('BLEClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops a timed sensor scan when its window ends', async () => {
    const client = await createClient();
    vi.useFakeTimers();

    await client.scanFor(() => {}, 30000);
    expect(client.isScanning).toBe(true);

    await vi.advanceTimersByTimeAsync(30000);
    expect(noble.stopScanningAsync).toHaveBeenCalled();
    expect(client.isScanning).toBe(false);
  });

  it('resumes an interrupted scan for the rest of its window only', async () => {
    const client = await createClient();
    vi.useFakeTimers();
    const characteristic = { uuid: '000102030405060708090a0b0c0d1910', writeAsync: vi.fn(async () => {}) };
    noble.connectAsync.mockResolvedValue(fakePeripheral(async () => ({ services: [], characteristics: [characteristic] })));
    const accessory = createAccessory({ bleAddress: 'a4:c1:38:00:00:01' });

    await client.scanFor(() => {}, 30000);
    await vi.advanceTimersByTimeAsync(10000);
    await client.updateDevice(accessory, { cmd: 0x01, data: 0x1 });
    expect(characteristic.writeAsync).toHaveBeenCalledTimes(1);

    // Scanning resumes shortly after the update...
    await vi.advanceTimersByTimeAsync(1000);
    expect(noble.startScanningAsync).toHaveBeenCalledTimes(2);
    expect(client.isScanning).toBe(true);

    // ...and still ends at the original deadline
    await vi.advanceTimersByTimeAsync(19000);
    expect(client.isScanning).toBe(false);
  });

  it('times out a stalled service discovery and still disconnects', async () => {
    const client = await createClient();
    vi.useFakeTimers();
    const peripheral = fakePeripheral(() => new Promise(() => {}));
    noble.connectAsync.mockResolvedValue(peripheral);
    const accessory = createAccessory({ bleAddress: 'a4:c1:38:00:00:01' });

    const result = client.updateDevice(accessory, { cmd: 0x01, data: 0x1 }).catch((err: Error) => err);
    await vi.advanceTimersByTimeAsync(10000);

    expect(await result).toEqual(new Error('Service discovery timeout'));
    expect(peripheral.disconnectAsync).toHaveBeenCalled();
  });

  it('does not start scanning after shutdown', async () => {
    const client = await createClient();
    client.shutdown();

    await client.scanFor(() => {}, 1000);

    expect(noble.startScanningAsync).not.toHaveBeenCalled();
  });
});
