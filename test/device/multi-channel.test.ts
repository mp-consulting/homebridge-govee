import { describe, expect, it } from 'vitest';

import { initializeDeviceHandlers } from '../../src/device/index.js';
import {
  decodeChannelStates,
  encodeChannelState,
  MultiChannelDevice,
  OutletDoubleDevice,
  SwitchTripleDevice,
} from '../../src/device/multi-channel.js';
import { createDeviceInstance, resolveCategory } from '../../src/device/registry.js';
import { createAccessory, createPlatform, hap } from '../helpers/hap.js';

const { Characteristic, Service } = hap;

describe('stateDual encoding', () => {
  it('matches the codes Govee uses', () => {
    expect([1, 2, 3].map(ch => encodeChannelState(ch, true))).toEqual([17, 34, 68]);
    expect([1, 2, 3].map(ch => encodeChannelState(ch, false))).toEqual([16, 32, 64]);
  });

  it('decodes single-channel, all-channel and partial reports', () => {
    expect(decodeChannelStates(17, 2)).toEqual(['on', undefined]);
    expect(decodeChannelStates(32, 2)).toEqual([undefined, 'off']);
    expect(decodeChannelStates(51, 2)).toEqual(['on', 'on']);
    expect(decodeChannelStates(48, 2)).toEqual(['off', 'off']);
    expect(decodeChannelStates(119, 3)).toEqual(['on', 'on', 'on']);
    expect(decodeChannelStates(112, 3)).toEqual(['off', 'off', 'off']);
    expect(decodeChannelStates(0x75, 3)).toEqual(['on', 'off', 'on']);
  });
});

describe('MultiChannelDevice', () => {
  function setup(Device: typeof OutletDoubleDevice) {
    const platform = createPlatform();
    const accessory = createAccessory({ gvModel: 'H5082' });
    const device = new Device(platform, accessory);
    device.init();
    return { platform, accessory, device };
  }

  it('exposes one service per channel', () => {
    const { accessory } = setup(SwitchTripleDevice);
    expect(accessory.services.filter(s => s.UUID === Service.Switch.UUID).map(s => s.subtype)).toEqual(['switch1', 'switch2', 'switch3']);
  });

  it('sends the per-channel command', async () => {
    const { platform, accessory } = setup(OutletDoubleDevice);

    await accessory.getService('Outlet 2')!.getCharacteristic(Characteristic.On).handleSetRequest(true);

    expect(platform.sendDeviceUpdate).toHaveBeenCalledWith(accessory, { cmd: 'stateDual', value: 34 });
  });

  it('applies external stateDual reports (double channels included)', () => {
    const { accessory, device } = setup(OutletDoubleDevice);

    device.externalUpdate({ source: 'AWS', stateDual: 51 });

    expect(accessory.getService('Outlet 1')!.getCharacteristic(Characteristic.On).value).toBe(true);
    expect(accessory.getService('Outlet 2')!.getCharacteristic(Characteristic.On).value).toBe(true);
  });

  it('replaces services of the other kind when showAs changes', () => {
    const platform = createPlatform();
    const accessory = createAccessory({ gvModel: 'H5082' });
    new MultiChannelDevice(platform, accessory, 2, 'Switch').init();

    new MultiChannelDevice(platform, accessory, 2, 'Outlet').init();

    expect(accessory.services.some(s => s.UUID === Service.Switch.UUID)).toBe(false);
    expect(accessory.services.filter(s => s.UUID === Service.Outlet.UUID)).toHaveLength(2);
  });
});

describe('showAs routing', () => {
  initializeDeviceHandlers();

  it.each([
    ['H6008', {}, 'light'],
    ['H6008', { showAs: 'switch' }, 'lightSwitch'],
    ['H5080', {}, 'switchSingle'],
    ['H5080', { showAs: 'outlet' }, 'outletSingle'],
    ['H5080', { showAs: 'valve' }, 'valve'],
    ['H5080', { showAs: 'stick' }, 'tv'],
    ['H5082', {}, 'switchDouble'],
    ['H5082', { showAs: 'outlet' }, 'outletDouble'],
    ['H5075', { showExtraSwitch: true }, 'sensorThermoSwitch'],
  ])('%s %j -> %s', (model, conf, expected) => {
    expect(resolveCategory(model, conf)).toBe(expected);
  });

  it('builds the handler the config asks for', () => {
    const platform = createPlatform();
    const accessory = createAccessory({ gvDeviceId: 'AA:BB:CC:DD:EE:FF:00:22', gvModel: 'H5080' });
    platform.deviceConf['AA:BB:CC:DD:EE:FF:00:22'] = { showAs: 'tap' };

    createDeviceInstance('H5080', platform, accessory);

    expect(accessory.getService(Service.Valve)).toBeDefined();
  });
});
