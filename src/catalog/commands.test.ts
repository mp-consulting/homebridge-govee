import { describe, it, expect } from 'vitest';
import {
  getAirQualityFromPM25,
  getAirQualityLabelFromPM25,
  PM25_THRESHOLDS,
} from './commands.js';

describe('getAirQualityFromPM25', () => {
  it('returns 1 (excellent) for PM2.5 <= 12', () => {
    expect(getAirQualityFromPM25(0)).toBe(1);
    expect(getAirQualityFromPM25(12)).toBe(1);
  });

  it('returns 2 (good) for PM2.5 13-35', () => {
    expect(getAirQualityFromPM25(13)).toBe(2);
    expect(getAirQualityFromPM25(35)).toBe(2);
  });

  it('returns 3 (fair) for PM2.5 36-75', () => {
    expect(getAirQualityFromPM25(36)).toBe(3);
    expect(getAirQualityFromPM25(75)).toBe(3);
  });

  it('returns 4 (inferior) for PM2.5 76-115', () => {
    expect(getAirQualityFromPM25(76)).toBe(4);
    expect(getAirQualityFromPM25(115)).toBe(4);
  });

  it('returns 5 (poor) for PM2.5 > 115', () => {
    expect(getAirQualityFromPM25(116)).toBe(5);
    expect(getAirQualityFromPM25(500)).toBe(5);
  });

  it('handles exact threshold boundaries', () => {
    expect(getAirQualityFromPM25(PM25_THRESHOLDS.excellent)).toBe(1);
    expect(getAirQualityFromPM25(PM25_THRESHOLDS.excellent + 1)).toBe(2);
    expect(getAirQualityFromPM25(PM25_THRESHOLDS.good)).toBe(2);
    expect(getAirQualityFromPM25(PM25_THRESHOLDS.good + 1)).toBe(3);
    expect(getAirQualityFromPM25(PM25_THRESHOLDS.fair)).toBe(3);
    expect(getAirQualityFromPM25(PM25_THRESHOLDS.fair + 1)).toBe(4);
    expect(getAirQualityFromPM25(PM25_THRESHOLDS.inferior)).toBe(4);
    expect(getAirQualityFromPM25(PM25_THRESHOLDS.inferior + 1)).toBe(5);
  });
});

describe('getAirQualityLabelFromPM25', () => {
  it('returns "excellent" for low PM2.5', () => {
    expect(getAirQualityLabelFromPM25(5)).toBe('excellent');
  });

  it('returns "good" for moderate PM2.5', () => {
    expect(getAirQualityLabelFromPM25(20)).toBe('good');
  });

  it('returns "fair" for elevated PM2.5', () => {
    expect(getAirQualityLabelFromPM25(50)).toBe('fair');
  });

  it('returns "inferior" for high PM2.5', () => {
    expect(getAirQualityLabelFromPM25(100)).toBe('inferior');
  });

  it('returns "poor" for very high PM2.5', () => {
    expect(getAirQualityLabelFromPM25(200)).toBe('poor');
  });
});
