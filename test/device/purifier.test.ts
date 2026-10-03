import { describe, expect, it } from 'vitest';

import { PurifierH7122Device } from '../../src/device/purifier-h7122.js';
import { PurifierH7123Device } from '../../src/device/purifier-h7123.js';
import { PURIFIER_H7122_SPEED_CODES, LOCK_CODES } from '../../src/catalog/index.js';
import { hexToBase64 } from '../../src/utils/functions.js';
import { createAccessory, createPlatform, hap } from '../helpers/hap.js';

const { Characteristic, Service } = hap;

// Govee status frames are 20 bytes: opcode bytes, payload, zero padding (checksum not validated on receive)
function frame(hex: string): string {
  return hexToBase64(hex.padEnd(40, '0'));
}

function setup(Device: typeof PurifierH7122Device | typeof PurifierH7123Device) {
  const platform = createPlatform();
  const accessory = createAccessory({ gvModel: 'H7122' });
  const device = new Device(platform, accessory);
  device.init();
  const purifier = accessory.getService(Service.AirPurifier)!;
  const air = accessory.getService(Service.AirQualitySensor)!;
  return { platform, accessory, device, purifier, air };
}

describe.each([
  ['H7122', PurifierH7122Device],
  ['H7123', PurifierH7123Device],
] as const)('%s purifier', (_model, Device) => {
  it('sends the speed code for a rotation speed', async () => {
    const { platform, accessory, purifier } = setup(Device);

    await purifier.getCharacteristic(Characteristic.RotationSpeed).handleSetRequest(60);

    expect(platform.sendDeviceUpdate).toHaveBeenCalledWith(accessory, { cmd: 'ptReal', value: PURIFIER_H7122_SPEED_CODES[3] });
  });

  it('sends power and lock commands', async () => {
    const { platform, accessory, purifier } = setup(Device);

    await purifier.getCharacteristic(Characteristic.Active).handleSetRequest(1);
    await purifier.getCharacteristic(Characteristic.LockPhysicalControls).handleSetRequest(1);

    expect(platform.sendDeviceUpdate).toHaveBeenNthCalledWith(1, accessory, { cmd: 'statePuri', value: 1 });
    expect(platform.sendDeviceUpdate).toHaveBeenNthCalledWith(2, accessory, { cmd: 'ptReal', value: LOCK_CODES.on });
    expect(purifier.getCharacteristic(Characteristic.CurrentAirPurifierState).value).toBe(2);
  });

  it('applies speed, lock and display opcode updates', () => {
    const { device, purifier, platform } = setup(Device);
    const displayLight = purifier.getCharacteristic(platform.cusChar.DisplayLight as never);

    device.externalUpdate({ source: 'AWS', state: 'on', commands: [frame('aa050103'), frame('aa1001'), frame('aa1601')] });

    expect(purifier.getCharacteristic(Characteristic.Active).value).toBe(1);
    expect(purifier.getCharacteristic(Characteristic.RotationSpeed).value).toBe(80);
    expect(purifier.getCharacteristic(Characteristic.LockPhysicalControls).value).toBe(1);
    expect(displayLight.value).toBe(true);
  });
});

describe('H7122 air quality', () => {
  it('reports PM2.5 density and the derived air quality', () => {
    const { device, air } = setup(PurifierH7122Device);

    device.externalUpdate({ source: 'AWS', commands: [frame('aa1c000023')] });

    expect(air.getCharacteristic(Characteristic.PM2_5Density).value).toBe(35);
    expect(air.getCharacteristic(Characteristic.AirQuality).value).toBeGreaterThan(1);
  });
});

describe('H7123 air quality', () => {
  it('has no PM2.5 density and maps Govee level 4 to HomeKit Poor', () => {
    const { device, air, purifier, platform } = setup(PurifierH7123Device);

    device.externalUpdate({ source: 'AWS', commands: [frame('aa19000004')] });

    expect(air.testCharacteristic(Characteristic.PM2_5Density)).toBe(false);
    expect(air.getCharacteristic(Characteristic.AirQuality).value).toBe(5);
    expect(purifier.testCharacteristic(platform.cusChar.NightLight as never)).toBe(true);
  });
});
