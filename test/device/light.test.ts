import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LightDevice } from '../../src/device/light.js';
import { collectWarnings, createAccessory, createPlatform, hap } from '../helpers/hap.js';

const { Characteristic } = hap;

function setup() {
  const platform = createPlatform();
  const accessory = createAccessory({ hasLanControl: true, useLanControl: true });
  const device = new LightDevice(platform, accessory);
  device.init();
  return { platform, accessory, device, service: device.service as unknown as hap.Service };
}

// Private handlers are reached the way HomeKit would reach them, through the characteristic
function setOn(service: hap.Service, value: boolean) {
  return service.getCharacteristic(Characteristic.On).handleSetRequest(value);
}

describe('LightDevice external updates', () => {
  it('updates saturation when an RGB update keeps the hue but changes saturation', () => {
    const { device, service } = setup();

    device.externalUpdate({ source: 'AWS', rgb: { r: 255, g: 0, b: 0 } });
    expect(service.getCharacteristic(Characteristic.Saturation).value).toBe(100);

    // Red -> pink: hue stays 0, saturation halves
    device.externalUpdate({ source: 'AWS', rgb: { r: 255, g: 128, b: 128 } });
    expect(service.getCharacteristic(Characteristic.Hue).value).toBe(0);
    expect(service.getCharacteristic(Characteristic.Saturation).value).toBe(50);
  });

  it('clamps colour temperatures outside the HomeKit range instead of sending illegal values', () => {
    const { device, service } = setup();
    const warnings = collectWarnings(service);

    device.externalUpdate({ source: 'AWS', kelvin: 9000 });
    expect(service.getCharacteristic(Characteristic.ColorTemperature).value).toBe(140);

    device.externalUpdate({ source: 'AWS', kelvin: 1800 });
    expect(service.getCharacteristic(Characteristic.ColorTemperature).value).toBe(500);

    expect(warnings).toEqual([]);
  });

  it('applies power state and brightness', () => {
    const { device, service } = setup();

    device.externalUpdate({ source: 'LAN', state: 'on', brightness: 42 });

    expect(service.getCharacteristic(Characteristic.On).value).toBe(true);
    expect(service.getCharacteristic(Characteristic.Brightness).value).toBe(42);
  });
});

describe('LightDevice on/off requests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a single on request', async () => {
    const { platform, service } = setup();

    const pending = setOn(service, true);
    await vi.advanceTimersByTimeAsync(400);
    await pending;

    expect(platform.sendDeviceUpdate).toHaveBeenCalledTimes(1);
    expect(platform.sendDeviceUpdate.mock.calls[0][1]).toEqual({ cmd: 'state', value: 'on' });
  });

  it('lets the last of two quick taps win (On then Off leaves the light off)', async () => {
    const { platform, service } = setup();

    const on = setOn(service, true);
    await vi.advanceTimersByTimeAsync(100);
    const off = setOn(service, false);
    await vi.advanceTimersByTimeAsync(400);
    await Promise.all([on, off]);

    // The light was already off, so the superseded On must not be sent
    expect(platform.sendDeviceUpdate).not.toHaveBeenCalled();
  });

  it('cancels pending characteristic reverts when destroyed', async () => {
    const { platform, device, service } = setup();
    platform.sendDeviceUpdate.mockRejectedValueOnce(new Error('offline'));
    const onChar = service.getCharacteristic(Characteristic.On);
    const updateValue = vi.spyOn(onChar, 'updateValue');

    const pending = setOn(service, true).catch(() => {});
    await vi.advanceTimersByTimeAsync(400);
    await pending;

    device.destroy();
    await vi.advanceTimersByTimeAsync(5000);

    expect(updateValue).not.toHaveBeenCalled();
  });
});
