import type { ExternalUpdateParams, RawDeviceUpdate } from '../types.js';
import platformConsts from './constants.js';

type RGB = { r: number; g: number; b: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRGB(value: unknown): value is RGB {
  return isRecord(value) && isFiniteNumber(value.r) && isFiniteNumber(value.g) && isFiniteNumber(value.b);
}

function toOnOff(value: unknown): 'on' | 'off' {
  if (typeof value === 'boolean') {
    return value ? 'on' : 'off';
  }
  const num = typeof value === 'number' ? value : Number(value);
  return !Number.isNaN(num) && [1, 17].includes(num) ? 'on' : 'off';
}

/**
 * Normalise a raw status payload from any connection (AWS, LAN, BLE or HTTP) into the
 * flat shape the device handlers consume.
 *
 * AWS and LAN report most values inside a `state` object (`onOff`, `brightness`, `color`,
 * `colorTemInKelvin`, `sta`), and AWS reports opcode updates in `op.command`. HTTP and BLE
 * readings arrive already flat. Values nested in `state` take precedence over top-level ones.
 */
export function normaliseDeviceUpdate(params: RawDeviceUpdate, model = ''): ExternalUpdateParams {
  const nested = isRecord(params.state) ? params.state : {};
  const src: Record<string, unknown> = { ...params, ...nested };
  const data: ExternalUpdateParams = { source: params.source };

  // Power state: a numeric/boolean onOff (AWS, LAN) or an already-normalised 'on'/'off'
  if (hasOwn(src, 'onOff')) {
    data.state = toOnOff(src.onOff);
  } else if (src.state === 'on' || src.state === 'off') {
    data.state = src.state;
  }

  // Brightness is a percentage, except for models that report on a 0-254 scale
  if (isFiniteNumber(src.brightness)) {
    const raw = src.brightness;
    const scaled = platformConsts.apiBrightnessScale.includes(model.toUpperCase()) || raw > 100
      ? Math.round(raw / 2.54)
      : raw;
    data.brightness = Math.min(Math.max(scaled, 0), 100);
  }

  // A colour temperature of 0 means the light is in RGB mode, so only forward real values
  const kelvin = src.colorTemInKelvin ?? src.kelvin;
  if (isFiniteNumber(kelvin) && kelvin > 0) {
    data.kelvin = kelvin;
  }
  const colour = src.color ?? src.rgb;
  if (isRGB(colour)) {
    data.rgb = { r: colour.r, g: colour.g, b: colour.b };
  }

  // Opcode updates (base64 frames) used by appliance handlers
  const opCommand = isRecord(src.op) ? src.op.command : undefined;
  const commands = Array.isArray(opCommand) ? opCommand : src.commands;
  if (Array.isArray(commands) && commands.every(cmd => typeof cmd === 'string')) {
    data.commands = commands as string[];
  }

  // Multi-outlet / multi-switch state bitmask
  const stateDual = isRecord(src.sta) ? src.sta.stateCode : src.stateDual;
  if (isFiniteNumber(stateDual)) {
    data.stateDual = stateDual;
  }

  if (isFiniteNumber(src.battery)) {
    data.battery = Math.min(Math.max(src.battery, 0), 100);
  }
  for (const key of ['temperature', 'humidity', 'setTemperature', 'pm25'] as const) {
    if (isFiniteNumber(src[key])) {
      data[key] = src[key];
    }
  }
  for (const key of ['leakDetected', 'online'] as const) {
    if (typeof src[key] === 'boolean') {
      data[key] = src[key];
    }
  }
  if (typeof src.scene === 'string' || isFiniteNumber(src.scene)) {
    data.scene = src.scene;
  }

  return data;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
