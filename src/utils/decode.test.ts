import { describe, it, expect } from 'vitest';
import {
  decodeH5074Values,
  decodeH5075Values,
  decodeH5101Values,
  decodeH5179Values,
  decodeAny,
} from './decode.js';

describe('decodeH5074Values', () => {
  it('decodes a known positive temperature stream', () => {
    // Construct a hex string: 3 bytes prefix + 88ec UUID + temp LSB + hum LSB + battery
    // Temp = 25.12°C → 2512 = 0x09D0 → LSB = D009 → chars 6-10: "d009"... wait
    // The function reads: temp_lsb = chars [8,10) + [6,8) and hum_lsb = chars [12,14) + [10,12)
    // Let's build: temp=25.12°C → 2512 → hex 09d0, stored as d0 09 (LSB first)
    // hum=65.00% → 6500 → hex 1964, stored as 64 19 (LSB first)
    // battery=85 → 0x55
    // So bytes at positions 3-8 (hex chars 6-17): d0 09 64 19 55
    // Need a prefix of 3 bytes (6 hex chars) that includes '88ec' and total length=18
    // hex: "88ec00" + "d009" + "6419" + "55" → "88ec00d00964195" only 17 chars
    // Actually isHt5074 checks includes('88ec') && length===18
    // Let's do: "88ec01d009641955" → 16 chars, need 18
    // Padding: "0088ec01d009641955" → wait let me count: 18 chars
    // positions 0-5: "0088ec", 6-7: "01", but the function reads starting at position 6
    // Hmm, let me think about the data format more carefully.
    //
    // The stream is manufacturer data as hex. For H5074:
    // - substring(8,10) concat substring(6,8) → temperature in 16-bit LSB
    // - substring(12,14) concat substring(10,12) → humidity in 16-bit LSB
    // - substring(14,16) → battery
    //
    // Build: "XX88ecTTTTHHHHBB" where XX is 2 bytes prefix
    // Let temp = 23.45°C = 2345 = 0x0929
    // LSB bytes: [29, 09] → hex chars at positions 6-9: "2909"
    // So substring(6,8) = "29", substring(8,10) = "09" → concat "0929" → parseInt = 2345 → /100 = 23.45
    // Hum = 55.50% = 5550 = 0x15AE
    // LSB bytes: [ae, 15] → hex chars at positions 10-13: "ae15"
    // substring(10,12) = "ae", substring(12,14) = "15" → concat "15ae" → parseInt = 5550 → /100 = 55.50
    // Battery = 90 = 0x5a → positions 14-15: "5a"
    // Full stream (length 18, includes '88ec'): "0088ec290915ae5a" → 16 chars → need 2 more
    // Actually let me recount. "0088ec" = 6 chars, "2909" = 4, "ae15" = 4, "5a" = 2 → total 16. Need 18.
    // Use "0088ec00290915ae5a" → 18 chars? That shifts positions.
    // Better approach: prefix must contain '88ec' somewhere and total length = 18 chars (9 bytes)
    // Byte layout: [b0, b1, b2, temp_lo, temp_hi, hum_lo, hum_hi, bat, b8]
    // No wait, length is 18 hex chars = 9 bytes, and the function reads:
    // positions 6-7,8-9 → bytes 3,4 (temp)
    // positions 10-11,12-13 → bytes 5,6 (hum)
    // positions 14-15 → byte 7 (battery)
    // So we have 9 bytes total. First 3 bytes (6 hex chars) = header containing '88ec'
    // Let's use "0188ec" as header (3 bytes), then temp, hum, battery as 2+2+1 = 5 bytes, plus 1 trailing.
    // Wait that's only 6+4+4+2 = 16. We need 18. So there must be an extra byte at the end.
    // Actually "0188ec" contains "88ec" at positions 2-5.
    // Temp: 23.45°C → 2345 → hex 0929, LSB: bytes [0x29, 0x09]
    // Hum: 55.50% → 5550 → hex 15AE, LSB: bytes [0xAE, 0x15]
    // Bat: 90 → 0x5A
    // Stream = "0188ec" + "2909" + "ae15" + "5a" + "00" = "0188ec2909ae155a00" → 18 chars ✓
    const stream = '0188ec2909ae155a00';
    const result = decodeH5074Values(stream);

    expect(result.tempInC).toBeCloseTo(23.45, 2);
    expect(result.tempInF).toBeCloseTo((23.45 * 9) / 5 + 32, 1);
    expect(result.humidity).toBeCloseTo(55.50, 2);
    expect(result.battery).toBe(90);
  });

  it('handles negative temperatures via twos complement', () => {
    // temp = -5.00°C → -500. As twos complement 16-bit: 65536 - 500 = 65036 = 0xFE0C
    // LSB bytes: [0x0C, 0xFE]
    // Hum: 80% → 8000 = 0x1F40, LSB: [0x40, 0x1F]
    // Bat: 50 → 0x32
    const stream = '0188ec0cfe401f3200';
    const result = decodeH5074Values(stream);

    expect(result.tempInC).toBeCloseTo(-5.00, 2);
    expect(result.battery).toBe(50);
  });
});

describe('decodeH5075Values', () => {
  it('decodes a known positive temperature stream', () => {
    // The function reads: encodedData = parseInt(substring(6,12), 16)
    // Format: tempInC = encodedData / 10000, humidity = (encodedData % 1000) / 10
    // battery = parseInt(substring(12,14), 16)
    //
    // encodedData = parseInt("03d5a6", 16) = 251302
    // tempInC = 251302 / 10000 = 25.1302
    // humidity = (251302 % 1000) / 10 = 302 / 10 = 30.2
    // battery = parseInt("5a", 16) = 90
    const stream = '0088ec03d5a65a00';
    const result = decodeH5075Values(stream);

    expect(result.tempInC).toBeCloseTo(25.1302, 2);
    expect(result.humidity).toBeCloseTo(30.2, 1);
    expect(result.battery).toBe(90);
  });

  it('decodes negative temperatures', () => {
    // Negative temp: bit 23 (0x800000) is set
    // For temp = -5.0°C, hum = 60.0%:
    // Without sign: encodedData where /10000 = 5.0 and %1000/10 = 60.0
    // encodedData % 1000 = 600, so encodedData = 5*10000 + k*1000 + 600
    // For simplicity: 50600 / 10000 = 5.06, 50600 % 1000 = 600 / 10 = 60.0
    // With sign bit: 50600 | 0x800000 = 50600 + 8388608 = 8439208 = 0x80C5A8
    // battery = 70 → 0x46
    const stream = '0088ec80c5a84600';
    const result = decodeH5075Values(stream);

    expect(result.tempInC).toBeCloseTo(-5.06, 2);
    expect(result.humidity).toBeCloseTo(60.0, 1);
    expect(result.battery).toBe(70);
  });
});

describe('decodeH5101Values', () => {
  it('decodes a known stream (similar format to H5075 but offset by 2)', () => {
    // substring(8,14) for encodedData, substring(14,16) for battery
    // encodedData = parseInt("03d5a6", 16) = 251302
    // tempInC = 251302 / 10000 = 25.1302
    // humidity = (251302 % 1000) / 10 = 30.2
    // battery = parseInt("5a", 16) = 90
    const stream = '0100000003d5a65a';
    const result = decodeH5101Values(stream);

    expect(result.tempInC).toBeCloseTo(25.1302, 2);
    expect(result.humidity).toBeCloseTo(30.2, 1);
    expect(result.battery).toBe(90);
  });
});

describe('decodeH5179Values', () => {
  it('decodes a known stream with different byte layout', () => {
    // substring(14,16) concat substring(16,18) → temp (not LSB, just concat)
    // substring(18,20) concat substring(16,18) → hum
    // substring(20,22) → battery
    //
    // temp = 22.50°C → 2250 → hex 08CA
    // substring(14,16) = "08", substring(16,18) = "ca" → concat "08ca" → 2250 → /100 = 22.50
    // hum: substring(18,20) = hum_hi, concat substring(16,18) = "ca"
    // humidity raw = parseInt(hum_hiBytes + "ca", 16) / 100
    // Let hum = 65.00% → 6500 → need hum_lsb = 6500 hex = 0x1964
    // hum_lsb = substring(18,20) + substring(16,18) = ? That gives us concat
    // Actually: hum_lsb = substring(18,20).concat(substring(16,18))
    // So if substring(16,18) = "64" and substring(18,20) = "19" → "1964" → 6500 → /100 = 65.00
    // Wait but we already set substring(16,18) for temp. Let me re-read the code.
    //
    // temp_lsb = substring(14,16).concat(substring(16,18))
    // hum_lsb = substring(18,20).concat(substring(16,18))
    //
    // So positions 16-18 are shared between temp and hum. This is just how the sensor encodes it.
    // Let's pick values:
    // substring(14,16) = "08" → temp high byte
    // substring(16,18) = "ca" → shared byte
    // substring(18,20) = "19" → hum extra byte
    // substring(20,22) = "5a" → battery = 90
    //
    // temp_lsb = "08ca" → 2250 → /100 = 22.50°C
    // hum_lsb = "19ca" → 6602 → /100 = 66.02%
    //
    // Need '0188' (h5179_uuid_rev) in stream, length=22
    // Prefix (14 chars): "01880000000000" (7 bytes)
    // Full: "01880000000000" + "08" + "ca" + "19" + "5a" = 14+2+2+2+2 = 22 ✓
    const stream = '0188000000000008ca195a';
    const result = decodeH5179Values(stream);

    expect(result.tempInC).toBeCloseTo(22.50, 2);
    expect(result.humidity).toBeCloseTo(66.02, 2);
    expect(result.battery).toBe(90);
  });
});

describe('decodeAny', () => {
  it('dispatches to H5074 decoder for matching stream', () => {
    // H5074: includes '88ec', length 18
    const stream = '0188ec2909ae155a00';
    const result = decodeAny(stream);
    expect(result.tempInC).toBeCloseTo(23.45, 2);
  });

  it('dispatches to H5075 decoder for matching stream', () => {
    // H5075: includes '88ec', length 16
    const stream = '0088ec03d5a65a00';
    const result = decodeAny(stream);
    expect(result.tempInC).toBeCloseTo(25.1302, 2);
  });

  it('dispatches to H5101 decoder for matching stream', () => {
    // H5101: includes '0100'
    const stream = '0100000003d5a65a';
    const result = decodeAny(stream);
    expect(result.tempInC).toBeCloseTo(25.1302, 2);
  });

  it('throws for unsupported stream', () => {
    expect(() => decodeAny('ffffffffffffffff')).toThrow('Unsupported stream update');
  });
});
