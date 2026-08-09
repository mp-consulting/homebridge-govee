import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import {
  bcc,
  buildMultiPacketFrames,
  buildSingleFrame,
  codeToFrames,
  COMMAND_MODE,
  detectSceneType,
  encodeDiy,
  encodeMusicMode,
  encodeScene,
  framesToCode,
  PROTOCOL_MULTI,
  PROTOCOL_WRITE,
  SceneType,
  SUB_MODE_DIY,
  SUB_MODE_MUSIC_LEGACY,
  SUB_MODE_MUSIC_MODERN,
  SUB_MODE_SCENE,
} from '../../src/utils/scene-codes.js';

/** A real RGBIC scene payload ("Forest", sceneId 130) taken from the Govee scene library. */
const FOREST_PARAM =
  'AyYAAQAKAgH/GQG0CgoCyBQF//8AAP//////AP//lP8AFAGWAAAAACMAAg8FAgH/FAH7AAAB+goEBP8A'
  + 'tP8AR///4/8AAAAAAAAAABoAAAABAgH/BQHIFBQC7hQBAP8AAAAAAAAAAA==';

function decode(frame: string): Buffer {
  return Buffer.from(frame, 'base64');
}

/**
 * Reference implementation of the app's XOR checksum, written independently of the
 * one under test so the test does not simply restate it.
 */
function expectedChecksum(frame: Buffer): number {
  return frame.subarray(0, 19).reduce((acc, byte) => acc ^ byte, 0);
}

describe('bcc', () => {
  it('xors every byte before the checksum position', () => {
    const frame = Buffer.from([0x33, 0x05, 0x04, ...Array.from({ length: 17 }).fill(0) as number[]]);
    expect(bcc(frame)).toBe(0x33 ^ 0x05 ^ 0x04);
  });
});

describe('buildSingleFrame', () => {
  it('produces a 20 byte frame with protocol, command, data and checksum', () => {
    const frame = buildSingleFrame(PROTOCOL_WRITE, COMMAND_MODE, [SUB_MODE_SCENE, 0xd4, 0x00]);
    expect(frame).toHaveLength(20);
    expect([...frame.subarray(0, 5)]).toEqual([0x33, 0x05, 0x04, 0xd4, 0x00]);
    expect([...frame.subarray(5, 19)]).toEqual(Array.from({ length: 14 }).fill(0));
    expect(frame[19]).toBe(expectedChecksum(frame));
  });
});

describe('buildMultiPacketFrames', () => {
  it('fits a short payload into the opening frame and still emits a terminator', () => {
    const payload = Buffer.from([1, 2, 3, 4, 5]);
    const frames = buildMultiPacketFrames(PROTOCOL_MULTI, [0x02], payload);

    expect(frames).toHaveLength(2);
    const [first, last] = frames;
    expect([...first.subarray(0, 5)]).toEqual([0xa3, 0x00, 0x01, 0x02, 0x02]);
    expect([...first.subarray(5, 10)]).toEqual([1, 2, 3, 4, 5]);
    expect(last[0]).toBe(0xa3);
    expect(last[1]).toBe(0xff);
  });

  it('numbers continuation frames and terminates with 0xff', () => {
    // 14 bytes ride in the opening frame, then 17 per continuation.
    const payload = Buffer.from(Array.from({ length: 14 + 17 + 17 + 5 }, (_, i) => i & 0xff));
    const frames = buildMultiPacketFrames(PROTOCOL_MULTI, [0x02], payload);

    // opening + 2 continuations + terminator
    expect(frames).toHaveLength(4);
    expect([...frames.map((frame) => frame[1])]).toEqual([0x00, 0x01, 0x02, 0xff]);
    expect(frames.every((frame) => frame.length === 20)).toBe(true);
    expect(frames.every((frame) => frame[0] === 0xa3)).toBe(true);
  });

  it('records the total frame count in the opening frame', () => {
    for (const length of [5, 14, 31, 48, 103, 400]) {
      const payload = Buffer.from(Array.from({ length }, () => 0xab));
      const frames = buildMultiPacketFrames(PROTOCOL_MULTI, [0x02], payload);
      // The count covers every frame written, opening and terminator included.
      expect(frames[0][3]).toBe(frames.length);
    }
  });

  it('checksums every frame', () => {
    const payload = Buffer.from(Array.from({ length: 90 }, (_, i) => i & 0xff));
    for (const frame of buildMultiPacketFrames(PROTOCOL_MULTI, [0x02], payload)) {
      expect(frame[19]).toBe(expectedChecksum(frame));
    }
  });

  it('reassembles to the original payload', () => {
    const payload = Buffer.from(Array.from({ length: 103 }, (_, i) => (i * 7) & 0xff));
    const frames = buildMultiPacketFrames(PROTOCOL_MULTI, [0x02], payload);

    const [first, ...rest] = frames;
    const terminator = rest.pop()!;
    const rebuilt = Buffer.concat([
      first.subarray(5, 19),
      ...rest.map((frame) => frame.subarray(2, 19)),
      terminator.subarray(2, 19),
    ]).subarray(0, payload.length);

    expect(rebuilt.equals(payload)).toBe(true);
  });

  it('uses a payload boundary of exactly 17 bytes for the final chunk', () => {
    // 14 in the opening frame + exactly 17 leaves a full final chunk, not an empty one.
    const payload = Buffer.from(Array.from({ length: 31 }, () => 0x5a));
    const frames = buildMultiPacketFrames(PROTOCOL_MULTI, [0x02], payload);
    expect(frames).toHaveLength(2);
    expect([...frames[1].subarray(2, 19)]).toEqual(Array.from({ length: 17 }).fill(0x5a));
  });
});

describe('detectSceneType', () => {
  it('recognises the length-prefixed RGBIC sub-effect layout', () => {
    expect(detectSceneType(Buffer.from(FOREST_PARAM, 'base64'))).toBe(SceneType.rgbic);
  });

  it('falls back to RGB for payloads that are not RGBIC-shaped', () => {
    expect(detectSceneType(Buffer.from([0x02, 0x01, 0x02, 0x03]))).toBe(SceneType.rgb);
  });
});

describe('encodeScene', () => {
  it('emits payload frames followed by the activation frame', () => {
    const frames = encodeScene({ scenceParam: FOREST_PARAM, sceneCode: 212, sceneType: SceneType.rgbic });
    const decoded = frames.map(decode);

    const activation = decoded.at(-1)!;
    expect([...activation.subarray(0, 5)]).toEqual([0x33, 0x05, 0x04, 212 & 0xff, 0x00]);

    const payloadFrames = decoded.slice(0, -1);
    expect(payloadFrames.every((frame) => frame[0] === 0xa3)).toBe(true);
    // RGBIC scenes use command type 0x02.
    expect(payloadFrames[0][4]).toBe(0x02);
    expect(payloadFrames.at(-1)![1]).toBe(0xff);
  });

  it('encodes the scene code little-endian', () => {
    const frames = encodeScene({ scenceParam: '', sceneCode: 0x0134, sceneType: SceneType.static });
    expect([...decode(frames[0]).subarray(2, 5)]).toEqual([0x04, 0x34, 0x01]);
  });

  it('sends only an activation frame for static scenes', () => {
    expect(encodeScene({ scenceParam: FOREST_PARAM, sceneCode: 49, sceneType: SceneType.static })).toHaveLength(1);
  });

  it('sends only an activation frame when there is no payload', () => {
    expect(encodeScene({ scenceParam: '', sceneCode: 49 })).toHaveLength(1);
  });

  it('detects the payload kind when sceneType is absent', () => {
    const withType = encodeScene({ scenceParam: FOREST_PARAM, sceneCode: 212, sceneType: SceneType.rgbic });
    const withoutType = encodeScene({ scenceParam: FOREST_PARAM, sceneCode: 212 });
    expect(withoutType).toEqual(withType);
  });

  it('strips the two byte protocol prefix from graffiti payloads', () => {
    const payload = Buffer.from(Array.from({ length: 20 }, (_, i) => i));
    const frames = encodeScene({
      scenceParam: payload.toString('base64'),
      sceneCode: 1,
      sceneType: SceneType.graffiti,
    });
    const first = decode(frames[0]);
    expect(first[4]).toBe(0x07);
    // Payload data starts at byte 5; the first two source bytes must be gone.
    expect(first[5]).toBe(2);
  });
});

describe('encodeDiy', () => {
  it('activates through the DIY sub-mode', () => {
    const frames = encodeDiy('', 7);
    expect([...decode(frames[0]).subarray(2, 5)]).toEqual([SUB_MODE_DIY, 7, 0]);
  });
});

describe('encodeMusicMode', () => {
  it('omits the colour bytes when auto colour is on', () => {
    const [frame] = encodeMusicMode({ effect: 'spectrum', sensitivity: 50, autoColour: true });
    const decoded = decode(frame);
    expect([...decoded.subarray(2, 6)]).toEqual([SUB_MODE_MUSIC_MODERN, 4, 50, 0]);
    expect([...decoded.subarray(6, 19)]).toEqual(Array.from({ length: 13 }).fill(0));
  });

  it('appends the colour when auto colour is off', () => {
    const [frame] = encodeMusicMode({
      effect: 'spectrum',
      sensitivity: 80,
      autoColour: false,
      colour: { r: 0x11, g: 0x22, b: 0x33 },
    });
    expect([...decode(frame).subarray(2, 9)]).toEqual([SUB_MODE_MUSIC_MODERN, 4, 80, 1, 0x11, 0x22, 0x33]);
  });

  it('carries the soft/power variant for rhythm', () => {
    const [soft] = encodeMusicMode({ effect: 'rhythm', sensitivity: 10, autoColour: true, soft: true });
    const [power] = encodeMusicMode({ effect: 'rhythm', sensitivity: 10, autoColour: true, soft: false });
    expect([...decode(soft).subarray(2, 7)]).toEqual([SUB_MODE_MUSIC_MODERN, 3, 10, 1, 0]);
    expect([...decode(power).subarray(2, 7)]).toEqual([SUB_MODE_MUSIC_MODERN, 3, 10, 0, 0]);
  });

  it('uses the legacy sub-mode and effect ids when asked', () => {
    const [frame] = encodeMusicMode({
      effect: 'energic',
      sensitivity: 30,
      autoColour: true,
      protocol: 'legacy',
    });
    // Legacy "energic" is a three byte payload with no colour flag at all.
    expect([...decode(frame).subarray(2, 6)]).toEqual([SUB_MODE_MUSIC_LEGACY, 0, 30, 0]);
  });

  it('inverts the dynamic flag on legacy rhythm', () => {
    const [soft] = encodeMusicMode({
      effect: 'rhythm', sensitivity: 10, autoColour: true, soft: true, protocol: 'legacy',
    });
    expect([...decode(soft).subarray(2, 7)]).toEqual([SUB_MODE_MUSIC_LEGACY, 5, 10, 0, 0]);
  });

  it('clamps sensitivity into 0-100', () => {
    const [high] = encodeMusicMode({ effect: 'rolling', sensitivity: 400, autoColour: true });
    const [low] = encodeMusicMode({ effect: 'rolling', sensitivity: -20, autoColour: true });
    expect(decode(high)[4]).toBe(100);
    expect(decode(low)[4]).toBe(0);
  });
});

describe('framesToCode / codeToFrames', () => {
  it('round-trips', () => {
    const frames = encodeScene({ scenceParam: FOREST_PARAM, sceneCode: 212, sceneType: SceneType.rgbic });
    expect(codeToFrames(framesToCode(frames))).toEqual(frames);
  });

  it('tolerates whitespace and trailing separators', () => {
    expect(codeToFrames(' AAA, BBB ,, ')).toEqual(['AAA', 'BBB']);
  });
});
