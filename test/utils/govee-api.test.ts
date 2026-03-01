import { describe, it, expect } from 'vitest';
import { generateClientId } from '../../src/utils/govee-api.js';

describe('generateClientId', () => {
  it('starts with "hb" prefix', () => {
    const id = generateClientId('test@example.com');
    expect(id.startsWith('hb')).toBe(true);
  });

  it('is deterministic for the same input', () => {
    const id1 = generateClientId('user@example.com');
    const id2 = generateClientId('user@example.com');
    expect(id1).toBe(id2);
  });

  it('produces different IDs for different inputs', () => {
    const id1 = generateClientId('user1@example.com');
    const id2 = generateClientId('user2@example.com');
    expect(id1).not.toBe(id2);
  });

  it('is 32 chars long (hb + 30 hex chars)', () => {
    // MD5 = 32 hex chars, minus last 2 = 30, plus "hb" = 32
    const id = generateClientId('test@example.com');
    expect(id.length).toBe(32);
  });
});
