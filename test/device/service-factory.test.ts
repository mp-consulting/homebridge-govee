import { describe, it, expect } from 'vitest';
import { getSpeedValidValues, getSpeedStepSize } from '../../src/device/service-factory.js';

describe('getSpeedValidValues', () => {
  it('generates correct values for maxSpeed=3', () => {
    expect(getSpeedValidValues(3)).toEqual([0, 33, 67, 100]);
  });

  it('generates correct values for maxSpeed=4', () => {
    expect(getSpeedValidValues(4)).toEqual([0, 25, 50, 75, 100]);
  });

  it('generates correct values for maxSpeed=8', () => {
    expect(getSpeedValidValues(8)).toEqual([0, 13, 25, 38, 50, 63, 75, 88, 100]);
  });

  it('always starts with 0 and ends with 100', () => {
    for (const max of [2, 3, 4, 5, 8, 9]) {
      const values = getSpeedValidValues(max);
      expect(values[0]).toBe(0);
      expect(values[values.length - 1]).toBe(100);
      expect(values.length).toBe(max + 1);
    }
  });

  it('generates monotonically increasing values', () => {
    const values = getSpeedValidValues(5);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});

describe('getSpeedStepSize', () => {
  it('returns 33 for maxSpeed=3', () => {
    expect(getSpeedStepSize(3)).toBe(33);
  });

  it('returns 25 for maxSpeed=4', () => {
    expect(getSpeedStepSize(4)).toBe(25);
  });

  it('returns 13 for maxSpeed=8', () => {
    expect(getSpeedStepSize(8)).toBe(13);
  });

  it('returns 50 for maxSpeed=2', () => {
    expect(getSpeedStepSize(2)).toBe(50);
  });

  it('returns 20 for maxSpeed=5', () => {
    expect(getSpeedStepSize(5)).toBe(20);
  });
});
