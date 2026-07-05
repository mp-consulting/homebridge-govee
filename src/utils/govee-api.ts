import crypto from 'node:crypto';

import axios from 'axios';

// Shared Govee API constants — used by both HTTPClient and the homebridge-ui server
export const GOVEE_APP_VERSION = '7.4.10';
export const GOVEE_USER_AGENT = `GoveeHome/${GOVEE_APP_VERSION} (com.ihoment.GoVeeSensor; build:8; iOS 26.5.0) Alamofire/5.11.0`;

export const GOVEE_API_URLS = {
  login: 'https://app2.govee.com/account/rest/account/v2/login',
  verification: 'https://app2.govee.com/account/rest/account/v1/verification',
  loginTTR: 'https://community-api.govee.com/os/v1/login',
  logout: 'https://app2.govee.com/account/rest/account/v1/logout',
  devices: 'https://app2.govee.com/device/rest/devices/v1/list',
  iotKey: 'https://app2.govee.com/app/v1/account/iot/key',
  tapToRuns: 'https://app2.govee.com/bff-app/v1/exec-plat/home',
  leakWarning: 'https://app2.govee.com/leak/rest/device/v1/warnMessage',
} as const;

// Govee returns HTTP 200 with this app-level status when an account logs in from
// a client/device it has not seen before. The account must confirm a one-time
// code that Govee emails, after which the same client id logs in cleanly.
export const GOVEE_STATUS_NEW_DEVICE = 454;

// The `type` value the Govee app sends when requesting a login verification code.
const VERIFICATION_TYPE_LOGIN = 8;

/**
 * Thrown when Govee requires a one-time email verification code before it will
 * issue a token for this client (the "new device" 2FA challenge). When this is
 * raised, a code has already been requested and emailed to the user; they need
 * to paste it into the plugin config and log in again.
 */
export class GoveeTwoFactorRequiredError extends Error {
  readonly code = 'GOVEE_2FA_REQUIRED';

  constructor(message: string) {
    super(message);
    this.name = 'GoveeTwoFactorRequiredError';
  }
}

/**
 * Thrown when a verification code was supplied but Govee rejected it (wrong or
 * expired). A fresh code has NOT been requested — the user should re-check the
 * email they already received, or clear the code to trigger a new one.
 */
export class GoveeTwoFactorInvalidError extends Error {
  readonly code = 'GOVEE_2FA_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'GoveeTwoFactorInvalidError';
  }
}

export interface GoveeLoginResult {
  token: string;
  clientId: string;
  accountId: string;
}

export interface GoveeDevice {
  device: string;
  deviceName: string;
  sku: string;
}

export function generateClientId(username: string): string {
  const hash = crypto.createHash('md5').update(username).digest('hex');
  return `hb${hash.substring(0, hash.length - 2)}`;
}

const MAX_BODY_PREVIEW = 400;

/**
 * Build a diagnostic error for a login response that came back without an
 * account token. Govee sometimes returns HTTP 200 with a body that is not the
 * expected `{ client: { token } }` shape — e.g. when the account needs
 * attention in the Govee Home app (an email-verification code or accepting
 * updated terms), or when the account is served by a regional backend this
 * plugin does not target. The old generic "no token received" message hid all
 * of that; this surfaces the HTTP status and the raw body so the failure is
 * actually diagnosable from the config UI and the Homebridge log.
 */
export function buildLoginFailureError(res: { status?: number; data?: unknown }): Error {
  const status = res?.status;
  const data = res?.data as Record<string, unknown> | undefined;

  const serverMessage = typeof data?.message === 'string' && data.message
    ? data.message
    : typeof data?.msg === 'string' && data.msg
      ? data.msg
      : undefined;

  if (serverMessage) {
    return new Error(`Govee login failed: ${serverMessage}${status ? ` (HTTP ${status})` : ''}`);
  }

  let bodyPreview: string;
  try {
    bodyPreview = data === undefined ? '(empty body)' : JSON.stringify(data);
  } catch {
    bodyPreview = String(data);
  }
  if (bodyPreview.length > MAX_BODY_PREVIEW) {
    bodyPreview = `${bodyPreview.slice(0, MAX_BODY_PREVIEW)}…`;
  }

  return new Error(
    `Govee login failed - the server returned ${status ? `HTTP ${status}` : 'a response'} without an account token. `
    + 'This usually means the account needs attention in the Govee Home app (e.g. an email-verification code or '
    + 'accepting updated terms), or the account is served by a region this plugin does not yet support. '
    + 'If you only control devices over Bluetooth or LAN, this cloud login is not required and your devices will still work. '
    + `Server response: ${bodyPreview}`,
  );
}

/**
 * Build standard Govee API headers
 */
export function goveeHeaders(token: string, clientId: string): Record<string, string | number> {
  return {
    'Authorization': `Bearer ${token}`,
    'appVersion': GOVEE_APP_VERSION,
    'clientId': clientId,
    'clientType': 1,
    'iotVersion': 0,
    'timestamp': Date.now(),
    'User-Agent': GOVEE_USER_AGENT,
  };
}

/**
 * Headers for the pre-authentication endpoints (login, verification) that run
 * before an account token exists.
 */
export function goveePreAuthHeaders(clientId: string): Record<string, string | number> {
  return {
    'appVersion': GOVEE_APP_VERSION,
    'clientId': clientId,
    'clientType': 1,
    'iotVersion': 0,
    'timestamp': Date.now(),
    'User-Agent': GOVEE_USER_AGENT,
  };
}

/**
 * Ask Govee to email a one-time login verification code to the account. Called
 * after a login returns {@link GOVEE_STATUS_NEW_DEVICE} so the user has a code
 * to paste back into the plugin config.
 */
export async function goveeRequestVerificationCode(username: string, clientId?: string): Promise<void> {
  const cid = clientId || generateClientId(username);
  await axios({
    url: GOVEE_API_URLS.verification,
    method: 'post',
    headers: goveePreAuthHeaders(cid),
    data: {
      type: VERIFICATION_TYPE_LOGIN,
      email: username,
    },
    timeout: 30000,
  });
}

export async function goveeLogin(username: string, password: string, code?: string): Promise<GoveeLoginResult> {
  const clientId = generateClientId(username);

  const data: Record<string, string> = {
    email: username,
    password: password,
    client: clientId,
  };
  if (code) {
    data.code = code;
  }

  const res = await axios({
    url: GOVEE_API_URLS.login,
    method: 'post',
    headers: goveePreAuthHeaders(clientId),
    data,
    timeout: 30000,
  });

  // New-device 2FA challenge: Govee wants an email code before issuing a token.
  if (res.data?.status === GOVEE_STATUS_NEW_DEVICE) {
    if (code) {
      throw new GoveeTwoFactorInvalidError(
        'The Govee verification code was not accepted. Please double-check the code from your email, '
        + 'or clear the code field and test again to have a new one sent.',
      );
    }
    await goveeRequestVerificationCode(username, clientId);
    throw new GoveeTwoFactorRequiredError(
      'Govee needs to verify this login. A verification code has been emailed to your Govee account address. '
      + 'Enter that code in the "Verification Code" field and test the connection again.',
    );
  }

  if (!res.data || !res.data.client || !res.data.client.token) {
    throw buildLoginFailureError(res);
  }

  return {
    token: res.data.client.token,
    clientId: clientId,
    accountId: res.data.client.accountId,
  };
}

export async function goveeGetDevices(token: string, clientId: string): Promise<GoveeDevice[]> {
  const res = await axios({
    url: GOVEE_API_URLS.devices,
    method: 'post',
    headers: goveeHeaders(token, clientId),
    timeout: 30000,
  });

  if (!res.data || !res.data.devices) {
    return [];
  }

  return res.data.devices;
}
