import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HumidifierH7142Device } from '../../src/device/humidifier-h7142.js';
import { HumidifierH7160Device } from '../../src/device/humidifier-h7160.js';
import { HUMIDIFIER_H7142_SPEED_CODES, HUMIDIFIER_H7142_UV_ON } from '../../src/catalog/index.js';
import { base64ToHex, hexToBase64 } from '../../src/utils/functions.js';
import { createAccessory, createPlatform, hap } from '../helpers/hap.js';

const { Characteristic, Service } = hap;

function frame(hex: string): string {
  return hexToBase64(hex.padEnd(40, '0'));
}

function setup(Device: typeof HumidifierH7160Device | typeof HumidifierH7142Device) {
  const platform = createPlatform();
  const accessory = createAccessory({ gvModel: 'H7160' });
  const device = new Device(platform, accessory);
  device.init();
  return {
    platform,
    accessory,
    device,
    fan: accessory.getService(Service.Fan)!,
    light: accessory.getService(Service.Lightbulb)!,
  };
}

describe.each([
  ['H7160', HumidifierH7160Device],
  ['H7142', HumidifierH7142Device],
] as const)('%s humidifier', (_model, Device) => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the speed code for a mist level', async () => {
    const { platform, accessory, fan } = setup(Device);

    await fan.getCharacteristic(Characteristic.RotationSpeed).handleSetRequest(40);

    expect(platform.sendDeviceUpdate).toHaveBeenCalledWith(accessory, { cmd: 'ptReal', value: HUMIDIFIER_H7142_SPEED_CODES[4] });
  });

  it('sends the night light colour and brightness', async () => {
    const { platform, light } = setup(Device);

    await light.getCharacteristic(Characteristic.On).handleSetRequest(true);

    const [, command] = platform.sendDeviceUpdate.mock.calls[0];
    expect(command.cmd).toBe('ptReal');
    expect(base64ToHex(command.value).startsWith('331b01')).toBe(true);
  });

  it('turns the night light tile off with the humidifier', async () => {
    const { device, fan, light } = setup(Device);
    device.externalUpdate({ source: 'AWS', state: 'on', commands: [frame('aa1b0132ff0000')] });
    expect(light.getCharacteristic(Characteristic.On).value).toBe(true);

    const pending = fan.getCharacteristic(Characteristic.On).handleSetRequest(false);
    await vi.runAllTimersAsync();
    await pending;

    expect(light.getCharacteristic(Characteristic.On).value).toBe(false);
  });

  it('applies speed and night light opcode updates', () => {
    const { device, fan, light } = setup(Device);

    device.externalUpdate({ source: 'AWS', state: 'on', commands: [frame('aa050107'), frame('aa1b0132ff0000')] });

    expect(fan.getCharacteristic(Characteristic.On).value).toBe(true);
    expect(fan.getCharacteristic(Characteristic.RotationSpeed).value).toBe(70);
    expect(light.getCharacteristic(Characteristic.On).value).toBe(true);
    expect(light.getCharacteristic(Characteristic.Brightness).value).toBe(50);
    expect(light.getCharacteristic(Characteristic.Hue).value).toBe(0);
    expect(light.getCharacteristic(Characteristic.Saturation).value).toBe(100);
  });
});

describe('H7160 specifics', () => {
  it('has no humidity sensor', () => {
    const { accessory } = setup(HumidifierH7160Device);
    expect(accessory.getService(Service.HumiditySensor)).toBeUndefined();
  });
});

describe('H7142 specifics', () => {
  it('reports humidity', () => {
    const { accessory, device } = setup(HumidifierH7142Device);

    // 0x01c2 = 450 tenths of a percent
    device.externalUpdate({ source: 'AWS', commands: [frame('aa1001' + '0001c2')] });

    expect(accessory.getService(Service.HumiditySensor)!.getCharacteristic(Characteristic.CurrentRelativeHumidity).value).toBe(45);
  });

  it('switches the UV light on with the humidifier', async () => {
    vi.useFakeTimers();
    try {
      const { platform, fan } = setup(HumidifierH7142Device);

      const pending = fan.getCharacteristic(Characteristic.On).handleSetRequest(true);
      await vi.runAllTimersAsync();
      await pending;

      expect(platform.sendDeviceUpdate.mock.calls.map(call => call[1])).toEqual([
        { cmd: 'stateHumi', value: 1 },
        { cmd: 'ptReal', value: HUMIDIFIER_H7142_UV_ON },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
