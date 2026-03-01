import { describe, it, expect } from 'vitest';
import { hs2rgb, rgb2hs, k2rgb, m2hs } from '../../src/utils/colour.js';

describe('hs2rgb', () => {
  it('converts pure red (hue=0, sat=100)', () => {
    // Case 0: rgb = [255, t=0, p=0], red=255 triggers 0.8 multiplier on g,b
    // but g=0, b=0 so <=25 zeroing kicks in
    expect(hs2rgb(0, 100)).toEqual([255, 0, 0]);
  });

  it('converts pure green (hue=120, sat=100)', () => {
    // Case 2: rgb = [p=0, 255, t=0]
    expect(hs2rgb(120, 100)).toEqual([0, 255, 0]);
  });

  it('converts pure blue (hue=240, sat=100)', () => {
    // Case 4: rgb = [t=0, p=0, 255]
    expect(hs2rgb(240, 100)).toEqual([0, 0, 255]);
  });

  it('converts white (sat=0) to near-white with red channel adjustment', () => {
    // At sat=0: p=255, q=255, t=255 → case 0: [255, 255, 255]
    // Red=255 triggers: g*=0.8=204, b*=0.8=204 (both >25 so no zeroing)
    expect(hs2rgb(0, 0)).toEqual([255, 204, 204]);
  });

  it('converts yellow (hue=60, sat=100)', () => {
    // h=60/60=1, f=0, case 1: [q=255*(1-1*0)=255, 255, p=0]
    // red=255 triggers 0.8 multiplier: g=255*0.8=204, b=0*0.8=0 (<=25 so zeroed)
    expect(hs2rgb(60, 100)).toEqual([255, 204, 0]);
  });

  it('accepts string inputs', () => {
    expect(hs2rgb('0', '100')).toEqual([255, 0, 0]);
  });

  it('handles hue=360 same as hue=0', () => {
    expect(hs2rgb(360, 100)).toEqual(hs2rgb(0, 100));
  });

  it('converts cyan (hue=180, sat=100)', () => {
    expect(hs2rgb(180, 100)).toEqual([0, 255, 255]);
  });

  it('converts magenta (hue=300, sat=100)', () => {
    // h=300/60=5, f=0, case 5: [255, p=0, q=255*(1-1*0)=255]
    // red=255 triggers 0.8 multiplier: g=0*0.8=0 (<=25 zeroed), b=255*0.8=204
    expect(hs2rgb(300, 100)).toEqual([255, 0, 204]);
  });
});

describe('rgb2hs', () => {
  it('converts pure red to [0, 100]', () => {
    expect(rgb2hs(255, 0, 0)).toEqual([0, 100]);
  });

  it('converts pure green to [120, 100]', () => {
    expect(rgb2hs(0, 255, 0)).toEqual([120, 100]);
  });

  it('converts pure blue to [240, 100]', () => {
    expect(rgb2hs(0, 0, 255)).toEqual([240, 100]);
  });

  it('converts black to [0, 0]', () => {
    expect(rgb2hs(0, 0, 0)).toEqual([0, 0]);
  });

  it('converts white to [0, 0]', () => {
    expect(rgb2hs(255, 255, 255)).toEqual([0, 0]);
  });

  it('converts yellow to [60, 100]', () => {
    expect(rgb2hs(255, 255, 0)).toEqual([60, 100]);
  });

  it('converts cyan to [180, 100]', () => {
    expect(rgb2hs(0, 255, 255)).toEqual([180, 100]);
  });

  it('accepts string inputs', () => {
    expect(rgb2hs('255', '0', '0')).toEqual([0, 100]);
  });

  it('handles negative hue wrapping', () => {
    // When red is max and green < blue, hue goes negative and wraps
    const [h] = rgb2hs(255, 0, 128);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(360);
  });
});

describe('k2rgb', () => {
  it('returns correct RGB for 2000K (warm)', () => {
    expect(k2rgb(2000)).toEqual([255, 141, 11]);
  });

  it('returns correct RGB for 6500K (daylight)', () => {
    expect(k2rgb(6500)).toEqual([255, 249, 253]);
  });

  it('returns correct RGB for 7100K (cool)', () => {
    expect(k2rgb(7100)).toEqual([243, 242, 255]);
  });

  it('clamps values below 2000K', () => {
    expect(k2rgb(1000)).toEqual(k2rgb(2000));
  });

  it('clamps values above 7100K', () => {
    expect(k2rgb(9000)).toEqual(k2rgb(7100));
  });

  it('rounds to nearest 100K', () => {
    expect(k2rgb(2049)).toEqual(k2rgb(2000));
    expect(k2rgb(2050)).toEqual(k2rgb(2100));
  });
});

describe('m2hs', () => {
  it('returns integer HS values for mired=140', () => {
    const [h, s] = m2hs(140);
    expect(Number.isInteger(h)).toBe(true);
    expect(Number.isInteger(s)).toBe(true);
  });

  it('returns integer HS values for mired=500', () => {
    const [h, s] = m2hs(500);
    expect(Number.isInteger(h)).toBe(true);
    expect(Number.isInteger(s)).toBe(true);
  });

  it('clamps values below 100 to 100', () => {
    expect(m2hs(50)).toEqual(m2hs(100));
  });

  it('clamps values above 500 to 500', () => {
    expect(m2hs(600)).toEqual(m2hs(500));
  });

  it('returns hue in [0, 360] and saturation in [0, 100]', () => {
    for (const m of [140, 200, 300, 400, 500]) {
      const [h, s] = m2hs(m);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(360);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('rounds fractional mired values', () => {
    expect(m2hs(200.4)).toEqual(m2hs(200));
    expect(m2hs(200.6)).toEqual(m2hs(201));
  });
});
