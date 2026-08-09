import { Buffer } from 'node:buffer';

/**
 * Encoding of Govee light "scenes" into the on-the-wire command frames that both
 * the AWS IoT `ptReal` command and the BLE control characteristic accept.
 *
 * The Govee app fetches a scene library per device (see `govee-content.ts`). Each
 * scene carries a base64 `scenceParam` blob — the raw effect definition — which the
 * app splits into 20-byte BLE frames before sending. Applying a scene is two steps:
 *
 *   1. transfer the effect payload as an `0xA3` multi-packet sequence, then
 *   2. activate it with a single `0x33 0x05 0x04 <sceneCode LE>` "set sub-mode" frame.
 *
 * The framing below is a direct port of the app's `MultipleControllerCommV1
 * .makeSendBytesV2()` so that the bytes we emit are identical to the ones the
 * official app writes.
 */

/** Multi-packet protocol byte used for scene/DIY payload transfer. */
export const PROTOCOL_MULTI = 0xa3;

/** Protocol byte for a single-frame write command. */
export const PROTOCOL_WRITE = 0x33;

/** Command type for "set mode". */
export const COMMAND_MODE = 0x05;

/**
 * Sub-mode identifiers, from the app's `BleProtocol` constants. Music has two
 * generations of protocol; which one a device speaks is a per-model property in the
 * app, so the plugin exposes it as a config choice.
 */
export const SUB_MODE_SCENE = 0x04;
export const SUB_MODE_DIY = 0x0a;
export const SUB_MODE_COLOUR = 0x0b;
export const SUB_MODE_MUSIC_LEGACY = 0x0c;
export const SUB_MODE_MUSIC_MODERN = 0x13;

/** Length of a single BLE frame, including the trailing checksum byte. */
const FRAME_LENGTH = 20;

/** Payload bytes carried by each continuation frame. */
const CONTINUATION_PAYLOAD = 17;

/**
 * Scene payload kinds, matching `CategoryV1.LightEffect.sceneType` in the Govee app.
 */
export const SceneType = {
  static: 0,
  rgb: 1,
  rgbic: 2,
  graffiti: 3,
  cube: 4,
  diy: 5,
  compose: 6,
} as const;

/**
 * Command-type byte the app uses for each scene payload kind. Derived from the
 * `MultiNewScenesControllerV*` classes that `ScenesOp.parseSceneV1()` dispatches to.
 *
 * `diy` (5) is device-specific in the app — several models each have their own
 * parser — so it falls back to the most common (`0x0a`) variant.
 */
const SCENE_COMMAND_TYPE: Record<number, number> = {
  [SceneType.rgb]: 0x01,
  [SceneType.rgbic]: 0x02,
  [SceneType.cube]: 0x04,
  [SceneType.graffiti]: 0x07,
  [SceneType.diy]: 0x0a,
  [SceneType.compose]: 0x0a,
};

/**
 * XOR checksum ("BCC") over the first `length` bytes of a frame — the app's
 * `BleUtils.getBCC()`.
 */
export function bcc(frame: Buffer, length: number = FRAME_LENGTH - 1): number {
  let checksum = frame[0];
  for (let i = 1; i < length; i += 1) {
    checksum ^= frame[i];
  }
  return checksum;
}

/**
 * Build a single 20-byte write frame: protocol, command type, data, then checksum.
 */
export function buildSingleFrame(protocol: number, commandType: number, data: number[] = []): Buffer {
  const frame = Buffer.alloc(FRAME_LENGTH);
  frame[0] = protocol;
  frame[1] = commandType;
  data.forEach((byte, index) => {
    frame[2 + index] = byte & 0xff;
  });
  frame[FRAME_LENGTH - 1] = bcc(frame);
  return frame;
}

/**
 * Split an arbitrary payload into the app's `0xA3` multi-packet frame sequence.
 *
 * The first frame carries a header (`0x01`, total frame count, then the caller's
 * header bytes) followed by as much payload as fits; continuation frames carry 17
 * payload bytes each and are numbered from 1; the final frame is numbered `0xFF`.
 *
 * Port of `MultipleControllerCommV1.makeSendBytesV2()`.
 */
export function buildMultiPacketFrames(protocol: number, header: number[], payload: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  const headerLength = header.length;

  const first = Buffer.alloc(FRAME_LENGTH);
  first[0] = protocol;
  first[1] = 0x00;
  first[2] = 0x01;
  header.forEach((byte, index) => {
    first[4 + index] = byte & 0xff;
  });

  const last = Buffer.alloc(FRAME_LENGTH);
  last[0] = protocol;
  last[1] = 0xff;

  const firstDataOffset = headerLength + 4;
  const firstCapacity = 15 - headerLength;
  let frameCount = 2;

  if (payload.length <= firstCapacity) {
    // Everything fits in the opening frame; the closing frame is a bare terminator.
    payload.copy(first, firstDataOffset);
  } else {
    const remaining = payload.length - firstCapacity;
    let finalChunkLength = remaining % CONTINUATION_PAYLOAD;
    const chunkCount = Math.floor(remaining / CONTINUATION_PAYLOAD) + (finalChunkLength > 0 ? 1 : 0);
    if (finalChunkLength === 0) {
      finalChunkLength = CONTINUATION_PAYLOAD;
    }
    frameCount = chunkCount + 1;

    payload.copy(first, firstDataOffset, 0, firstCapacity);

    let offset = firstCapacity;
    for (let index = 1; index <= chunkCount; index += 1) {
      const isFinal = index === chunkCount;
      const size = isFinal ? finalChunkLength : CONTINUATION_PAYLOAD;
      const chunk = Buffer.alloc(CONTINUATION_PAYLOAD);
      payload.copy(chunk, 0, offset, offset + size);
      offset += size;

      if (isFinal) {
        // The tail of the payload rides in the 0xFF terminator frame.
        chunk.copy(last, 2);
      } else {
        const middle = Buffer.alloc(FRAME_LENGTH);
        middle[0] = protocol;
        middle[1] = index;
        chunk.copy(middle, 2);
        middle[FRAME_LENGTH - 1] = bcc(middle);
        frames.push(middle);
      }
    }
  }

  first[3] = frameCount;
  first[FRAME_LENGTH - 1] = bcc(first);
  frames.unshift(first);

  last[FRAME_LENGTH - 1] = bcc(last);
  frames.push(last);

  return frames;
}

/**
 * Structural check for an RGBIC scene payload: a count of sub-effects, then each
 * sub-effect prefixed with its own length. Port of `ScenesRgbIC.isValidProtocolBytes()`.
 *
 * Used only as a fallback when the scene library did not tell us the payload kind.
 */
function looksLikeRgbic(payload: Buffer): boolean {
  if (payload.length < 2) {
    return false;
  }
  const effectCount = payload[0];
  if (effectCount === 0) {
    return false;
  }
  let offset = 1;
  let consumed = 1;
  for (let index = 0; index < effectCount; index += 1) {
    if (offset >= payload.length) {
      return false;
    }
    const effectLength = payload[offset];
    consumed += effectLength + 1;
    if (consumed > payload.length) {
      return false;
    }
    offset += 1 + effectLength;
  }
  return consumed === payload.length;
}

/**
 * Best-effort payload-kind detection for scenes that arrive without a `sceneType`.
 */
export function detectSceneType(payload: Buffer): number {
  return looksLikeRgbic(payload) ? SceneType.rgbic : SceneType.rgb;
}

export interface EncodeSceneOptions {
  /** Base64 `scenceParam` from the Govee scene library. */
  scenceParam: string;
  /** Numeric scene code used by the activation frame. */
  sceneCode: number;
  /** `LightEffect.sceneType`; detected from the payload when omitted. */
  sceneType?: number;
}

/**
 * Turn a scene library entry into the ordered list of base64 frames that apply it.
 *
 * A `static` scene (`sceneType` 0) carries no effect payload — it is applied by the
 * activation frame alone.
 */
export function encodeScene(options: EncodeSceneOptions): string[] {
  const { sceneCode } = options;
  const activation = buildSingleFrame(PROTOCOL_WRITE, COMMAND_MODE, [
    SUB_MODE_SCENE,
    sceneCode & 0xff,
    (sceneCode >> 8) & 0xff,
  ]);

  const payload = options.scenceParam ? Buffer.from(options.scenceParam, 'base64') : Buffer.alloc(0);
  if (payload.length === 0 || options.sceneType === SceneType.static) {
    return [activation.toString('base64')];
  }

  const sceneType = options.sceneType ?? detectSceneType(payload);
  const commandType = SCENE_COMMAND_TYPE[sceneType];
  if (commandType === undefined) {
    // Unknown payload kind — activating by scene code alone still works on devices
    // that already hold the effect, and is better than emitting garbage frames.
    return [activation.toString('base64')];
  }

  // Graffiti payloads carry a two-byte protocol prefix the app strips before framing.
  const body = sceneType === SceneType.graffiti && payload.length > 2 ? payload.subarray(2) : payload;

  const frames = buildMultiPacketFrames(PROTOCOL_MULTI, [commandType], body);
  return [...frames.map((frame) => frame.toString('base64')), activation.toString('base64')];
}

/**
 * Encode a DIY effect. DIY uses the same multi-packet transfer as scenes but is
 * activated through the DIY sub-mode with the effect's own code.
 */
export function encodeDiy(effectStr: string, diyCode: number): string[] {
  const activation = buildSingleFrame(PROTOCOL_WRITE, COMMAND_MODE, [
    SUB_MODE_DIY,
    diyCode & 0xff,
    (diyCode >> 8) & 0xff,
  ]);

  const payload = effectStr ? Buffer.from(effectStr, 'base64') : Buffer.alloc(0);
  if (payload.length === 0) {
    return [activation.toString('base64')];
  }

  const frames = buildMultiPacketFrames(PROTOCOL_MULTI, [SCENE_COMMAND_TYPE[SceneType.diy]], payload);
  return [...frames.map((frame) => frame.toString('base64')), activation.toString('base64')];
}

/**
 * Which generation of the music protocol a device speaks. The app keys this off an
 * internal per-model table; the plugin exposes it as a per-device config choice.
 */
export type MusicProtocol = 'modern' | 'legacy';

/**
 * Music effect ids differ between the two protocol generations, so effects are named
 * here and resolved to the right byte at encode time. `rhythm` additionally supports a
 * "soft" variant, carried in the dynamic byte.
 */
export const MUSIC_EFFECTS = ['energic', 'rolling', 'spectrum', 'rhythm'] as const;

export type MusicEffect = (typeof MUSIC_EFFECTS)[number];

const MUSIC_EFFECT_CODES: Record<MusicProtocol, Record<MusicEffect, number>> = {
  // BleProtocol.value_sub_mode_new_music_*
  modern: { rhythm: 3, spectrum: 4, energic: 5, rolling: 6 },
  // BleProtocol.value_sub_mode_music_*
  legacy: { energic: 0, rolling: 2, spectrum: 3, rhythm: 5 },
};

export interface MusicModeOptions {
  effect: MusicEffect;
  /** 0-100. */
  sensitivity: number;
  /** When true the device picks colours itself; when false `colour` is applied. */
  autoColour: boolean;
  colour?: { r: number; g: number; b: number };
  /** Rhythm only: the "soft" rather than "power" variant. */
  soft?: boolean;
  protocol?: MusicProtocol;
}

/**
 * Build the music-mode frame.
 *
 * Both generations share a shape: the sub-mode, the effect id, the sensitivity, then a
 * colour flag — 1 when an explicit colour follows, 0 when the device should choose. Only
 * rhythm carries the extra "dynamic" byte selecting the soft or power variant, and its
 * sense is inverted between the two generations.
 *
 * Modern (`OldMusic.l()` in the app, sub-mode 0x13):
 *   rhythm      -> [sub, effect, sensitivity, soft, manualColour, r, g, b]
 *   otherwise   -> [sub, effect, sensitivity, manualColour, r, g, b]
 *
 * Legacy (`SubModeMusic.getWriteBytes()`, sub-mode 0x0c):
 *   energic     -> [sub, effect, sensitivity]
 *   rhythm      -> [sub, effect, sensitivity, !soft, manualColour, r, g, b]
 *   otherwise   -> [sub, effect, sensitivity, manualColour, r, g, b]
 */
export function encodeMusicMode(options: MusicModeOptions): string[] {
  const protocol = options.protocol ?? 'modern';
  const subMode = protocol === 'legacy' ? SUB_MODE_MUSIC_LEGACY : SUB_MODE_MUSIC_MODERN;
  const effect = MUSIC_EFFECT_CODES[protocol][options.effect];
  const sensitivity = Math.min(Math.max(Math.round(options.sensitivity), 0), 100);
  const manual = options.autoColour ? 0 : 1;
  const { r = 0, g = 0, b = 0 } = options.colour ?? {};
  const colourBytes = manual ? [manual, r, g, b] : [manual];

  let data: number[];
  if (protocol === 'legacy') {
    if (options.effect === 'energic') {
      data = [subMode, effect, sensitivity];
    } else if (options.effect === 'rhythm') {
      data = [subMode, effect, sensitivity, options.soft ? 0 : 1, ...colourBytes];
    } else {
      data = [subMode, effect, sensitivity, ...colourBytes];
    }
  } else if (options.effect === 'rhythm') {
    data = [subMode, effect, sensitivity, options.soft ? 1 : 0, ...colourBytes];
  } else {
    data = [subMode, effect, sensitivity, ...colourBytes];
  }

  return [buildSingleFrame(PROTOCOL_WRITE, COMMAND_MODE, data).toString('base64')];
}

/*
 * Scene speed and direction deliberately have no encoder here.
 *
 * In the Govee app they are not separate commands: `SceneSpeedM` rewrites bytes
 * *inside* the effect payload before it is framed, using per-model patch routines
 * (H6093, H7086, H682x, H7072, ...) driven by the `speedInfo` descriptor. Emitting a
 * guessed "set speed" frame would put unknown bytes on the wire.
 *
 * What is generic — and what this plugin uses instead — is that a scene often ships
 * several `lightEffects` variants, each with its own `scenceParamId`. Selecting among
 * those is exactly how the app persists a speed choice (`IndexMode`), so the plugin
 * exposes the variants and the `supportsSpeed` / `supportedDirections` metadata, and
 * encodes whichever variant the user picked.
 */

/**
 * Join encoded frames into the comma-separated form used by the plugin config and
 * by the AWS `ptReal` command payload.
 */
export function framesToCode(frames: string[]): string {
  return frames.join(',');
}

/**
 * Split a stored config code back into individual frames, tolerating whitespace.
 */
export function codeToFrames(code: string): string[] {
  return code
    .split(',')
    .map((frame) => frame.trim())
    .filter((frame) => frame.length > 0);
}
