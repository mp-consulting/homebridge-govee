import { describe, expect, it } from 'vitest';

import { Heater1aDevice } from '../../src/device/heater1a.js';
import { Heater1bDevice } from '../../src/device/heater1b.js';
import {
  DEVICE_STATE_CODES,
  HEATER_H7130_SPEED_CODES,
  HEATER_H7130_TEMP_CODES_HEAT,
  HEATER_SWING_CODES,
  LOCK_CODES,
} from '../../src/catalog/index.js';
import { hexToBase64 } from '../../src/utils/functions.js';
import { createAccessory, createPlatform, hap } from '../helpers/hap.js';

const { Characteristic, Service } = hap;

function frame(hex: string): string {
  return hexToBase64(hex.padEnd(40, '0'));
}

function setup<T extends Heater1aDevice | Heater1bDevice>(Device: new (...args: never[]) => T) {
  const platform = createPlatform();
  const accessory = createAccessory({ gvModel: 'H7130' });
  const device = new Device(...([platform, accessory] as never[]));
  device.init();
  return { platform, accessory, device };
}

describe('Heater1aDevice (no temperature reporting)', () => {
  it('exposes a Fanv2 with speed, swing and lock', async () => {
    const { platform, accessory } = setup(Heater1aDevice);
    const fan = accessory.getService(Service.Fanv2)!;

    await fan.getCharacteristic(Characteristic.Active).handleSetRequest(1);
    await fan.getCharacteristic(Characteristic.RotationSpeed).handleSetRequest(66);
    await fan.getCharacteristic(Characteristic.SwingMode).handleSetRequest(1);
    await fan.getCharacteristic(Characteristic.LockPhysicalControls).handleSetRequest(1);

    expect(platform.sendDeviceUpdate.mock.calls.map(call => call[1].value)).toEqual([
      DEVICE_STATE_CODES.on, HEATER_H7130_SPEED_CODES[66], HEATER_SWING_CODES.on, LOCK_CODES.on,
    ]);
    expect(accessory.getService(Service.HeaterCooler)).toBeUndefined();
  });

  it('applies speed, swing and lock opcode updates', () => {
    const { accessory, device } = setup(Heater1aDevice);
    const fan = accessory.getService(Service.Fanv2)!;

    device.externalUpdate({ source: 'AWS', state: 'on', commands: [frame('aa0503'), frame('aa1801'), frame('aa1001')] });

    expect(fan.getCharacteristic(Characteristic.Active).value).toBe(1);
    expect(fan.getCharacteristic(Characteristic.RotationSpeed).value).toBe(99);
    expect(fan.getCharacteristic(Characteristic.SwingMode).value).toBe(1);
    expect(fan.getCharacteristic(Characteristic.LockPhysicalControls).value).toBe(1);
  });

  it('suggests tempReporting when the device reports a plausible temperature', () => {
    const { accessory, device } = setup(Heater1aDevice);

    device.externalUpdate({ source: 'AWS', temperature: 7000 });

    expect(accessory.logWarn).toHaveBeenCalledWith(expect.stringContaining('enable `tempReporting`'));
  });
});

describe('Heater1bDevice (temperature reporting)', () => {
  it('exposes a HeaterCooler plus a Fan for speed', async () => {
    const { platform, accessory } = setup(Heater1bDevice);
    const heater = accessory.getService(Service.HeaterCooler)!;
    const fan = accessory.getService(Service.Fan)!;

    await fan.getCharacteristic(Characteristic.RotationSpeed).handleSetRequest(33);
    await heater.getCharacteristic(Characteristic.TargetHeaterCoolerState).handleSetRequest(1);
    await heater.getCharacteristic(Characteristic.HeatingThresholdTemperature).handleSetRequest(22);

    expect(platform.sendDeviceUpdate.mock.calls.map(call => call[1].value)).toEqual([
      HEATER_H7130_SPEED_CODES[33], HEATER_H7130_TEMP_CODES_HEAT[20], HEATER_H7130_TEMP_CODES_HEAT[22],
    ]);
    expect(accessory.getService(Service.Fanv2)).toBeUndefined();
  });

  it('keeps the fan tile in step with the heater power', async () => {
    const { accessory } = setup(Heater1bDevice);

    await accessory.getService(Service.HeaterCooler)!.getCharacteristic(Characteristic.Active).handleSetRequest(1);

    expect(accessory.getService(Service.Fan)!.getCharacteristic(Characteristic.On).value).toBe(true);
  });

  it('applies temperatures, mode and speed updates', () => {
    const { accessory, device } = setup(Heater1bDevice);
    const heater = accessory.getService(Service.HeaterCooler)!;
    const fan = accessory.getService(Service.Fan)!;

    // Temperatures arrive in hundredths of °F
    device.externalUpdate({ source: 'AWS', state: 'on', temperature: 7000, setTemperature: 7700, commands: [frame('aa1a00'), frame('aa0502')] });

    expect(heater.getCharacteristic(Characteristic.CurrentTemperature).value).toBe(21);
    expect(heater.getCharacteristic(Characteristic.HeatingThresholdTemperature).value).toBe(25);
    expect(heater.getCharacteristic(Characteristic.TargetHeaterCoolerState).value).toBe(1);
    expect(fan.getCharacteristic(Characteristic.On).value).toBe(true);
    expect(fan.getCharacteristic(Characteristic.RotationSpeed).value).toBe(66);
  });
});
