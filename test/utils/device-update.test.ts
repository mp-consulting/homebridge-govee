import { describe, expect, it } from 'vitest';

import { normaliseDeviceUpdate } from '../../src/utils/device-update.js';

describe('normaliseDeviceUpdate', () => {
  it('maps an AWS light status payload', () => {
    const payload = {
      source: 'AWS' as const,
      device: 'AA:BB:CC:DD:EE:FF:00:11',
      sku: 'H6008',
      cmd: 'status',
      state: { onOff: 1, brightness: 64, color: { r: 10, g: 20, b: 30 }, colorTemInKelvin: 0 },
    };

    expect(normaliseDeviceUpdate(payload, 'H6008')).toEqual({
      source: 'AWS',
      state: 'on',
      brightness: 64,
      rgb: { r: 10, g: 20, b: 30 },
    });
  });

  it('forwards a colour temperature when the light is in white mode', () => {
    const data = normaliseDeviceUpdate({ source: 'AWS', state: { onOff: 0, colorTemInKelvin: 4000 } });
    expect(data).toEqual({ source: 'AWS', state: 'off', kelvin: 4000 });
  });

  it('maps a LAN devStatus reply (values at the top level)', () => {
    const data = normaliseDeviceUpdate({
      source: 'LAN',
      onOff: 1,
      brightness: 100,
      color: { r: 255, g: 255, b: 255 },
      colorTemInKelvin: 7200,
    });
    expect(data).toEqual({
      source: 'LAN',
      state: 'on',
      brightness: 100,
      rgb: { r: 255, g: 255, b: 255 },
      kelvin: 7200,
    });
  });

  it('passes AWS opcode updates through as commands', () => {
    const data = normaliseDeviceUpdate({ source: 'AWS', state: { onOff: 1 }, op: { command: ['qhIBAA==', 'qgUBAQ=='] } });
    expect(data.commands).toEqual(['qhIBAA==', 'qgUBAQ==']);
  });

  it('maps the multi-outlet state bitmask', () => {
    expect(normaliseDeviceUpdate({ source: 'AWS', state: { sta: { stateCode: 119 } } }).stateDual).toBe(119);
  });

  it('treats onOff 17 as on and anything unknown as off', () => {
    expect(normaliseDeviceUpdate({ source: 'AWS', state: { onOff: 17 } }).state).toBe('on');
    expect(normaliseDeviceUpdate({ source: 'AWS', state: { onOff: 'garbage' } }).state).toBe('off');
  });

  it('scales 0-254 brightness for models that report it and for out-of-range values', () => {
    expect(normaliseDeviceUpdate({ source: 'AWS', brightness: 127 }, 'H6008').brightness).toBe(50);
    expect(normaliseDeviceUpdate({ source: 'AWS', brightness: 127 }, 'H6002').brightness).toBe(50);
    expect(normaliseDeviceUpdate({ source: 'AWS', brightness: 80 }, 'h6002').brightness).toBe(31);
    expect(normaliseDeviceUpdate({ source: 'AWS', brightness: 80 }, 'H6008').brightness).toBe(80);
  });

  it('keeps flat sensor readings and clamps battery', () => {
    expect(normaliseDeviceUpdate({
      source: 'HTTP', battery: 140, temperature: 2213, humidity: 5170, pm25: 12, online: true, leakDetected: false,
    })).toEqual({
      source: 'HTTP', battery: 100, temperature: 2213, humidity: 5170, pm25: 12, online: true, leakDetected: false,
    });
  });

  it('drops values of the wrong type', () => {
    expect(normaliseDeviceUpdate({
      source: 'AWS',
      brightness: '50',
      color: { r: 'x', g: 0, b: 0 },
      online: 'yes',
      op: { command: [1, 2] },
    } as never)).toEqual({ source: 'AWS' });
  });
});
