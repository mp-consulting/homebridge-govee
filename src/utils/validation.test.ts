import { Buffer } from 'node:buffer';
import { describe, it, expect } from 'vitest';
import { isHt5074, isHt5075, isHt5101, isHt5179, isValidPeripheral } from './validation.js';

describe('isHt5074', () => {
  it('returns true for valid H5074 hex (includes 88ec, length 18)', () => {
    expect(isHt5074('0188ec2909ae155a00')).toBe(true);
  });

  it('returns false for wrong length', () => {
    expect(isHt5074('0088ec03d5a65a00')).toBe(false); // length 16
  });

  it('returns false for missing UUID', () => {
    expect(isHt5074('01aacc2909ae155a00')).toBe(false);
  });
});

describe('isHt5075', () => {
  it('returns true for valid H5075 hex (includes 88ec, length 16)', () => {
    expect(isHt5075('0088ec03d5a65a00')).toBe(true);
  });

  it('returns false for wrong length', () => {
    expect(isHt5075('0188ec2909ae155a00')).toBe(false); // length 18
  });

  it('returns false for missing UUID', () => {
    expect(isHt5075('00aacc03d5a65a00')).toBe(false);
  });
});

describe('isHt5101', () => {
  it('returns true for hex including 0100', () => {
    expect(isHt5101('0100000003d5a65a')).toBe(true);
  });

  it('returns false for missing UUID', () => {
    expect(isHt5101('ff00000003d5a65a')).toBe(false);
  });
});

describe('isHt5179', () => {
  it('returns true for valid H5179 hex (includes 0188, length 22)', () => {
    expect(isHt5179('0188000000000008ca195a')).toBe(true);
  });

  it('returns false for wrong length', () => {
    expect(isHt5179('018800000008ca195a')).toBe(false);
  });

  it('returns false for missing UUID', () => {
    expect(isHt5179('ff00000000000008ca195a')).toBe(false);
  });
});

describe('isValidPeripheral', () => {
  it('returns true for peripheral with valid H5074 data', () => {
    const peripheral = {
      advertisement: {
        manufacturerData: Buffer.from('0188ec2909ae155a00', 'hex'),
      },
    };
    expect(isValidPeripheral(peripheral)).toBe(true);
  });

  it('returns false for peripheral without advertisement', () => {
    expect(isValidPeripheral({})).toBe(false);
  });

  it('returns false for peripheral without manufacturerData', () => {
    expect(isValidPeripheral({ advertisement: {} })).toBe(false);
  });

  it('returns false for peripheral with unrecognized data', () => {
    const peripheral = {
      advertisement: {
        manufacturerData: Buffer.from('ffffffffffff', 'hex'),
      },
    };
    expect(isValidPeripheral(peripheral)).toBe(false);
  });
});
