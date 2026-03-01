import { Buffer } from 'node:buffer';
import { describe, it, expect, vi } from 'vitest';
import {
  base64ToHex,
  hexToBase64,
  cenToFar,
  farToCen,
  hexToDecimal,
  hexToTwoItems,
  nearestHalf,
  parseDeviceId,
  parseError,
  speedPercentToValue,
  speedValueToPercent,
  generateCodeFromHexValues,
  statusToActionCode,
  hasProperty,
  getTwoItemPosition,
  processCommands,
  generateNightLightCode,
  generateNightLightOffCode,
  createDebouncedGuard,
  generateRandomString,
} from '../../src/utils/functions.js';

describe('base64ToHex / hexToBase64', () => {
  it('roundtrips correctly', () => {
    const hex = 'aabbccddee';
    expect(base64ToHex(hexToBase64(hex))).toBe(hex);
  });

  it('converts known base64 to hex', () => {
    // "AAEC" → base64 of bytes 0x00, 0x01, 0x02
    expect(base64ToHex('AAEC')).toBe('000102');
  });

  it('converts known hex to base64', () => {
    expect(hexToBase64('000102')).toBe('AAEC');
  });
});

describe('cenToFar', () => {
  it('converts freezing point', () => {
    expect(cenToFar(0)).toBe(32);
  });

  it('converts boiling point', () => {
    expect(cenToFar(100)).toBe(212);
  });

  it('converts negative temperatures', () => {
    expect(cenToFar(-40)).toBe(-40);
  });

  it('rounds to one decimal place', () => {
    expect(cenToFar(37)).toBe(98.6);
  });
});

describe('farToCen', () => {
  it('converts freezing point', () => {
    expect(farToCen(32)).toBe(0);
  });

  it('converts boiling point', () => {
    expect(farToCen(212)).toBe(100);
  });

  it('converts negative temperatures', () => {
    expect(farToCen(-40)).toBe(-40);
  });

  it('rounds to integer', () => {
    expect(farToCen(98.6)).toBe(37);
  });
});

describe('hexToDecimal', () => {
  it('converts "00" to 0', () => {
    expect(hexToDecimal('00')).toBe(0);
  });

  it('converts "ff" to 255', () => {
    expect(hexToDecimal('ff')).toBe(255);
  });

  it('converts "1a" to 26', () => {
    expect(hexToDecimal('1a')).toBe(26);
  });
});

describe('hexToTwoItems', () => {
  it('splits even-length hex string into byte pairs', () => {
    expect(hexToTwoItems('aabbcc')).toEqual(['aa', 'bb', 'cc']);
  });

  it('handles odd-length string (last item is single char)', () => {
    expect(hexToTwoItems('aabbc')).toEqual(['aa', 'bb', 'c']);
  });

  it('returns empty array for empty string', () => {
    expect(hexToTwoItems('')).toEqual([]);
  });

  it('handles single byte', () => {
    expect(hexToTwoItems('ff')).toEqual(['ff']);
  });
});

describe('nearestHalf', () => {
  it('rounds 0.24 to 0', () => {
    expect(nearestHalf(0.24)).toBe(0);
  });

  it('rounds 0.25 to 0.5', () => {
    expect(nearestHalf(0.25)).toBe(0.5);
  });

  it('rounds 0.74 to 0.5', () => {
    expect(nearestHalf(0.74)).toBe(0.5);
  });

  it('rounds 0.75 to 1.0', () => {
    expect(nearestHalf(0.75)).toBe(1);
  });

  it('keeps integers unchanged', () => {
    expect(nearestHalf(5)).toBe(5);
  });

  it('handles negative values', () => {
    expect(nearestHalf(-1.3)).toBe(-1.5);
  });
});

describe('parseDeviceId', () => {
  it('uppercases the ID', () => {
    expect(parseDeviceId('aa:bb:cc')).toBe('AA:BB:CC');
  });

  it('removes invalid characters', () => {
    expect(parseDeviceId('AB-CD.EF')).toBe('ABCDEF');
  });

  it('preserves colons and underscores', () => {
    expect(parseDeviceId('AB:CD_EF')).toBe('AB:CD_EF');
  });

  it('preserves hex digits', () => {
    expect(parseDeviceId('0123456789abcdef')).toBe('0123456789ABCDEF');
  });
});

describe('parseError', () => {
  it('extracts message from Error', () => {
    const err = new Error('test error');
    const result = parseError(err);
    expect(result).toContain('test error');
  });

  it('includes first stack line by default', () => {
    const err = new Error('test error');
    const result = parseError(err);
    expect(result.length).toBeGreaterThan('test error'.length);
  });

  it('hides stack for messages in hideStack list', () => {
    const err = new Error('hidden error');
    const result = parseError(err, ['hidden error']);
    expect(result).toBe('hidden error');
  });

  it('converts non-Error to string', () => {
    expect(parseError('just a string')).toBe('just a string');
    expect(parseError(42)).toBe('42');
  });
});

describe('speedPercentToValue', () => {
  it('converts 100% to maxSpeed', () => {
    expect(speedPercentToValue(100, 3)).toBe(3);
    expect(speedPercentToValue(100, 8)).toBe(8);
  });

  it('clamps minimum to 1', () => {
    expect(speedPercentToValue(1, 8)).toBe(1);
  });

  it('clamps maximum to maxSpeed', () => {
    expect(speedPercentToValue(200, 3)).toBe(3);
  });

  it('uses Math.floor by default', () => {
    // 50% with maxSpeed=3 → 50 / 33.33 = 1.5 → floor → 1
    expect(speedPercentToValue(50, 3)).toBe(1);
  });

  it('accepts custom rounding function', () => {
    // 50% with maxSpeed=3 → 1.5 → ceil → 2
    expect(speedPercentToValue(50, 3, Math.ceil)).toBe(2);
  });

  it('handles maxSpeed=4 at typical percentages', () => {
    expect(speedPercentToValue(25, 4)).toBe(1);
    expect(speedPercentToValue(50, 4)).toBe(2);
    expect(speedPercentToValue(75, 4)).toBe(3);
    expect(speedPercentToValue(100, 4)).toBe(4);
  });
});

describe('speedValueToPercent', () => {
  it('converts maxSpeed to 100%', () => {
    expect(speedValueToPercent(3, 3)).toBe(100);
    expect(speedValueToPercent(8, 8)).toBe(100);
  });

  it('converts value 1 correctly', () => {
    expect(speedValueToPercent(1, 3)).toBe(33);
    expect(speedValueToPercent(1, 4)).toBe(25);
    expect(speedValueToPercent(1, 8)).toBe(13);
  });

  it('roundtrips with speedPercentToValue for maxSpeed=4', () => {
    for (let v = 1; v <= 4; v++) {
      const pct = speedValueToPercent(v, 4);
      expect(speedPercentToValue(pct, 4)).toBe(v);
    }
  });
});

describe('generateCodeFromHexValues', () => {
  it('produces a 20-byte base64 string', () => {
    const result = generateCodeFromHexValues([0x33, 0x01, 0x01]) as string;
    const buf = Buffer.from(result, 'base64');
    expect(buf.length).toBe(20);
  });

  it('last byte is XOR checksum of the first 19', () => {
    const result = generateCodeFromHexValues([0x33, 0x01, 0x01]) as string;
    const buf = Buffer.from(result, 'base64');
    let xor = 0;
    for (let i = 0; i < 19; i++) {
      xor ^= buf[i];
    }
    expect(buf[19]).toBe(xor);
  });

  it('returns a Buffer when returnAsHexBuffer is true', () => {
    const result = generateCodeFromHexValues([0x33, 0x01, 0x01], true);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('pads short input to 19 bytes before checksum', () => {
    const result = generateCodeFromHexValues([0xaa], true) as Buffer;
    expect(result.length).toBe(20);
    // Bytes 1-18 should be 0 (padding)
    for (let i = 1; i < 19; i++) {
      expect(result[i]).toBe(0);
    }
  });

  it('accepts nested arrays (flattened)', () => {
    const result1 = generateCodeFromHexValues([0x33, 0x1b, 0x01]) as string;
    const result2 = generateCodeFromHexValues([0x33, [0x1b, 0x01]]) as string;
    expect(result1).toBe(result2);
  });
});

describe('statusToActionCode', () => {
  it('transforms a status code into an action code', () => {
    // statusToActionCode: prepends "33", slices middle of status code, regenerates with checksum
    // Input: 42 hex chars → chopped = "33" + input[2..40] = 40 chars → 20 hex pairs → 20 bytes
    // generateCodeFromHexValues pads to 19 bytes + 1 checksum = 20 bytes → 40 hex chars output
    const result = statusToActionCode('aa0101000000000000000000000000000000000000');
    expect(result.length % 2).toBe(0); // even number of hex chars
    // Should start with 33 (the replacement prefix)
    expect(result.startsWith('33')).toBe(true);
  });
});

describe('hasProperty', () => {
  it('returns true for own properties', () => {
    expect(hasProperty({ a: 1 }, 'a')).toBe(true);
  });

  it('returns false for missing properties', () => {
    expect(hasProperty({ a: 1 }, 'b')).toBe(false);
  });

  it('returns false for prototype properties', () => {
    expect(hasProperty({}, 'toString')).toBe(false);
  });
});

describe('getTwoItemPosition', () => {
  it('returns 1-indexed item', () => {
    expect(getTwoItemPosition(['a', 'b', 'c'], 1)).toBe('a');
    expect(getTwoItemPosition(['a', 'b', 'c'], 2)).toBe('b');
    expect(getTwoItemPosition(['a', 'b', 'c'], 3)).toBe('c');
  });
});

describe('processCommands', () => {
  it('dispatches commands to the correct handler', () => {
    // Build a base64 command that starts with 0xAA, func=0x01 0x01
    const hexValues = [0xaa, 0x01, 0x01, ...Array(16).fill(0)];
    let xor = 0;
    hexValues.forEach((b) => {
      xor ^= b;
    });
    hexValues.push(xor);
    const cmd = Buffer.from(hexValues).toString('base64');

    const handler = vi.fn();
    processCommands([cmd], { '0101': handler });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('skips commands not starting with 0xAA', () => {
    const hexValues = [0xbb, 0x01, 0x01, ...Array(17).fill(0)];
    const cmd = Buffer.from(hexValues).toString('base64');

    const handler = vi.fn();
    processCommands([cmd], { '0101': handler });
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls default handler for unknown function codes', () => {
    const hexValues = [0xaa, 0xff, 0xff, ...Array(16).fill(0)];
    let xor = 0;
    hexValues.forEach((b) => {
      xor ^= b;
    });
    hexValues.push(xor);
    const cmd = Buffer.from(hexValues).toString('base64');

    const defaultHandler = vi.fn();
    processCommands([cmd], {}, defaultHandler);
    expect(defaultHandler).toHaveBeenCalledOnce();
  });
});

describe('generateNightLightCode', () => {
  it('returns a base64 string', () => {
    const result = generateNightLightCode(50, 0, 100);
    expect(typeof result).toBe('string');
    // Verify it decodes to 20 bytes
    expect(Buffer.from(result, 'base64').length).toBe(20);
  });

  it('starts with night light command bytes (0x33, 0x1b, 0x01)', () => {
    const result = generateNightLightCode(50, 120, 100);
    const buf = Buffer.from(result, 'base64');
    expect(buf[0]).toBe(0x33);
    expect(buf[1]).toBe(0x1b);
    expect(buf[2]).toBe(0x01);
    expect(buf[3]).toBe(50); // brightness
  });
});

describe('generateNightLightOffCode', () => {
  it('returns a base64 string with off flag', () => {
    const result = generateNightLightOffCode();
    const buf = Buffer.from(result, 'base64');
    expect(buf[0]).toBe(0x33);
    expect(buf[1]).toBe(0x1b);
    expect(buf[2]).toBe(0x00); // off
  });
});

describe('createDebouncedGuard', () => {
  it('returns true when no subsequent call is made', async () => {
    vi.useFakeTimers();
    const guard = createDebouncedGuard(100);
    const promise = guard();
    vi.advanceTimersByTime(100);
    expect(await promise).toBe(true);
    vi.useRealTimers();
  });

  it('returns false for earlier calls when a new call is made', async () => {
    vi.useFakeTimers();
    const guard = createDebouncedGuard(100);

    const first = guard();
    const second = guard();

    vi.advanceTimersByTime(100);

    expect(await first).toBe(false);
    expect(await second).toBe(true);
    vi.useRealTimers();
  });

  it('only the last of many rapid calls returns true', async () => {
    vi.useFakeTimers();
    const guard = createDebouncedGuard(50);

    const results: Promise<boolean>[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(guard());
    }

    vi.advanceTimersByTime(50);

    const resolved = await Promise.all(results);
    // Only the last should be true
    expect(resolved.filter(Boolean)).toEqual([true]);
    expect(resolved[4]).toBe(true);
    vi.useRealTimers();
  });

  it('independent guards do not interfere', async () => {
    vi.useFakeTimers();
    const guardA = createDebouncedGuard(100);
    const guardB = createDebouncedGuard(100);

    const a = guardA();
    const b = guardB();

    vi.advanceTimersByTime(100);

    expect(await a).toBe(true);
    expect(await b).toBe(true);
    vi.useRealTimers();
  });
});

describe('generateRandomString', () => {
  it('returns a string of the requested length', () => {
    expect(generateRandomString(10).length).toBe(10);
    expect(generateRandomString(32).length).toBe(32);
    expect(generateRandomString(1).length).toBe(1);
  });

  it('returns an empty string for length 0', () => {
    expect(generateRandomString(0)).toBe('');
  });

  it('only contains lowercase alphanumeric characters', () => {
    const result = generateRandomString(100);
    expect(result).toMatch(/^[a-z0-9]+$/);
  });

  it('generates different strings on successive calls', () => {
    // Very unlikely to collide with length 32
    const a = generateRandomString(32);
    const b = generateRandomString(32);
    expect(a).not.toBe(b);
  });
});
