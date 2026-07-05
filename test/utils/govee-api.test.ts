import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import {
  buildLoginFailureError,
  generateClientId,
  GOVEE_API_URLS,
  goveeLogin,
  GoveeTwoFactorInvalidError,
  GoveeTwoFactorRequiredError,
} from '../../src/utils/govee-api.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

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

describe('goveeLogin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the token, client id and account id on success', async () => {
    mockedAxios.mockResolvedValueOnce({
      status: 200,
      data: { client: { token: 'tok-123', accountId: 42 } },
    } as never);

    const result = await goveeLogin('user@example.com', 'pw');

    expect(result.token).toBe('tok-123');
    expect(result.accountId).toBe(42);
    expect(result.clientId).toBe(generateClientId('user@example.com'));
    // Login body should carry the derived, stable client id.
    expect(mockedAxios).toHaveBeenCalledTimes(1);
    const loginCall = mockedAxios.mock.calls[0][0] as { url: string; data: Record<string, unknown> };
    expect(loginCall.url).toBe(GOVEE_API_URLS.login);
    expect(loginCall.data.client).toBe(result.clientId);
    expect(loginCall.data.code).toBeUndefined();
  });

  it('on a 454 with no code, requests an email code and throws GoveeTwoFactorRequiredError', async () => {
    // First call: login returns the "new device" status. Second call: the
    // verification-code request that Govee triggers an email from.
    mockedAxios
      .mockResolvedValueOnce({ status: 200, data: { status: 454 } } as never)
      .mockResolvedValueOnce({ status: 200, data: {} } as never);

    await expect(goveeLogin('user@example.com', 'pw')).rejects.toBeInstanceOf(GoveeTwoFactorRequiredError);

    expect(mockedAxios).toHaveBeenCalledTimes(2);
    const verifyCall = mockedAxios.mock.calls[1][0] as { url: string; data: Record<string, unknown> };
    expect(verifyCall.url).toBe(GOVEE_API_URLS.verification);
    expect(verifyCall.data.email).toBe('user@example.com');
  });

  it('on a 454 when a code was supplied, throws GoveeTwoFactorInvalidError without requesting a new code', async () => {
    mockedAxios.mockResolvedValueOnce({ status: 200, data: { status: 454 } } as never);

    await expect(goveeLogin('user@example.com', 'pw', '0000')).rejects.toBeInstanceOf(GoveeTwoFactorInvalidError);

    // Only the login call — no second verification request.
    expect(mockedAxios).toHaveBeenCalledTimes(1);
    const loginCall = mockedAxios.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(loginCall.data.code).toBe('0000');
  });

  it('surfaces a diagnostic error when the response has no token and is not a 2FA challenge', async () => {
    mockedAxios.mockResolvedValueOnce({ status: 200, data: { status: 401, message: 'Incorrect password' } } as never);

    await expect(goveeLogin('user@example.com', 'pw')).rejects.toThrow(/Incorrect password/);
  });
});
