import { describe, it, expect } from 'vitest';
import { buildLoginFailureError, generateClientId } from '../../src/utils/govee-api.js';

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

describe('buildLoginFailureError', () => {
  it('uses a server-provided message when present', () => {
    const err = buildLoginFailureError({ status: 401, data: { message: 'Incorrect password' } });
    expect(err.message).toBe('Govee login failed: Incorrect password (HTTP 401)');
  });

  it('falls back to the alternate "msg" field', () => {
    const err = buildLoginFailureError({ status: 400, data: { msg: 'Account locked' } });
    expect(err.message).toBe('Govee login failed: Account locked (HTTP 400)');
  });

  it('surfaces the HTTP status and raw body when there is no token and no message', () => {
    const err = buildLoginFailureError({ status: 200, data: { status: 200, foo: 'bar' } });
    expect(err.message).toContain('HTTP 200');
    expect(err.message).toContain('Server response: {"status":200,"foo":"bar"}');
    // It should also reassure BLE/LAN-only users that cloud login is optional.
    expect(err.message).toContain('Bluetooth or LAN');
  });

  it('handles an empty body', () => {
    const err = buildLoginFailureError({ status: 200 });
    expect(err.message).toContain('Server response: (empty body)');
  });

  it('truncates a very long body', () => {
    const big = { blob: 'x'.repeat(1000) };
    const err = buildLoginFailureError({ status: 200, data: big });
    expect(err.message).toContain('…');
    // Untruncated this would be ~1375 chars (guidance + 1000-char body); the
    // cap keeps it well under that, proving the body preview was truncated.
    expect(err.message.length).toBeLessThan(900);
  });
});
