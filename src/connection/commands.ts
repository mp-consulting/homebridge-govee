import type { AWSParams, BLEParams, DeviceCommand, LANParams } from '../types.js';
import { k2rgb } from '../utils/colour.js';
import platformConsts from '../utils/constants.js';
import { codeToFrames, encodeMusicMode, type MusicModeOptions } from '../utils/scene-codes.js';

export interface TransportCommands {
  awsParams?: AWSParams;
  bleParams?: BLEParams;
  lanParams?: LANParams;
}

/** Per-device settings that change how commands are encoded */
export interface CommandOptions {
  awsBrightnessNoScale?: unknown;
  awsColourMode?: unknown;
}

/**
 * The payload of a BLE colour command (opcode 0x05), which comes in three model-specific shapes
 */
function bleColourData(model: string, { r, g, b }: { r: number; g: number; b: number }): number[] {
  if (platformConsts.bleColourD.includes(model)) {
    return [0x0d, r, g, b];
  }
  if (platformConsts.bleColour1501.includes(model)) {
    // Colour for all segments: 15 01, RGB, five unused bytes, then the segment mask
    return [0x15, 0x01, r, g, b, 0, 0, 0, 0, 0, 0xff, 0x7f];
  }
  return [0x02, r, g, b];
}

/**
 * Encode a device command for each transport (AWS, BLE, LAN). A transport is absent when the
 * command has no form for it. `model` must be upper case.
 */
export function buildTransportCommands(command: DeviceCommand, model: string, options: CommandOptions = {}): TransportCommands {
  const commands: TransportCommands = {};
  switch (command.cmd) {
    case 'state':
      commands.awsParams = { cmd: 'turn', data: { val: command.value === 'on' ? 1 : 0 } };
      commands.bleParams = { cmd: 0x01, data: command.value === 'on' ? 0x1 : 0x0 };
      commands.lanParams = { cmd: 'turn', data: { value: command.value === 'on' ? 1 : 0 } };
      break;
    case 'brightness': {
      const val = command.value as number;
      commands.awsParams = { cmd: 'brightness', data: { val: options.awsBrightnessNoScale ? val : Math.round(val * 2.54) } };
      commands.bleParams = {
        cmd: 0x04,
        data: platformConsts.bleBrightnessNoScale.includes(model) ? val : Math.floor((val / 100) * 0xff),
      };
      commands.lanParams = { cmd: 'brightness', data: { value: val } };
      break;
    }
    case 'color': {
      const rgb = command.value as { r: number; g: number; b: number };
      // Some older models only accept the legacy 'color' command, in one of two payload shapes
      switch (options.awsColourMode) {
        case 'rgb':
          commands.awsParams = { cmd: 'color', data: rgb };
          break;
        case 'redgreenblue':
          commands.awsParams = { cmd: 'color', data: { red: rgb.r, green: rgb.g, blue: rgb.b } };
          break;
        default:
          commands.awsParams = { cmd: 'colorwc', data: { color: rgb, colorTemInKelvin: 0 } };
      }
      commands.bleParams = { cmd: 0x05, data: bleColourData(model, rgb) };
      commands.lanParams = { cmd: 'colorwc', data: { color: rgb, colorTemInKelvin: 0 } };
      break;
    }
    case 'colorTem': {
      const kelvin = command.value as number;
      const [r, g, b] = k2rgb(kelvin);
      commands.awsParams = { cmd: 'colorwc', data: { color: { r, g, b }, colorTemInKelvin: kelvin } };
      commands.bleParams = { cmd: 0x05, data: [0x02, 0xff, 0xff, 0xff, 0x01, r, g, b] };
      commands.lanParams = { cmd: 'colorwc', data: { color: { r, g, b }, colorTemInKelvin: kelvin } };
      break;
    }
    case 'stateOutlet':
    case 'stateHumi': {
      const on = command.value === 'on' || command.value === 1;
      const val = command.cmd === 'stateOutlet' && platformConsts.awsOutlet1617.includes(model) ? (on ? 17 : 16) : (on ? 1 : 0);
      commands.awsParams = { cmd: 'turn', data: { val } };
      break;
    }
    case 'stateDual':
      commands.awsParams = { cmd: 'turn', data: { val: command.value } };
      break;
    case 'ptReal': {
      const code = command.value as string;
      commands.awsParams = { cmd: 'ptReal', data: { command: [code] } };
      // The BLE client base64-decodes this itself, so pass the code through as-is.
      commands.bleParams = { cmd: 'ptReal', data: code };
      break;
    }
    case 'rgbScene': {
      const [awsCode, bleCode] = command.value as [string, string | undefined];
      // A scene is a sequence of 20-byte frames. AWS takes them in one message;
      // BLE writes them in order over a single connection.
      const awsFrames = awsCode ? codeToFrames(awsCode) : [];
      const bleFrames = codeToFrames(bleCode || awsCode || '');
      if (awsFrames.length > 0) {
        commands.awsParams = { cmd: 'ptReal', data: { command: awsFrames } };
      }
      if (bleFrames.length > 0) {
        commands.bleParams = { cmd: 'ptReal', data: bleFrames };
      }
      break;
    }
    case 'musicMode': {
      const frames = encodeMusicMode(command.value as MusicModeOptions);
      commands.awsParams = { cmd: 'ptReal', data: { command: frames } };
      commands.bleParams = { cmd: 'ptReal', data: frames };
      break;
    }
    default:
      throw new Error('Invalid command');
  }

  return commands;
}
