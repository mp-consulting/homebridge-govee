import crypto from 'node:crypto';

import axios from 'axios';

// Shared Govee API constants — used by both HTTPClient and the homebridge-ui server
export const GOVEE_APP_VERSION = '6.8.01';
export const GOVEE_USER_AGENT = `GoveeHome/${GOVEE_APP_VERSION} (com.ihoment.GoVeeSensor; build:2; iOS 18.3.0) Alamofire/5.10.2`;

export const GOVEE_API_URLS = {
  login: 'https://app2.govee.com/account/rest/account/v1/login',
  loginTTR: 'https://community-api.govee.com/os/v1/login',
  logout: 'https://app2.govee.com/account/rest/account/v1/logout',
  devices: 'https://app2.govee.com/device/rest/devices/v1/list',
  iotKey: 'https://app2.govee.com/app/v1/account/iot/key',
  tapToRuns: 'https://app2.govee.com/bff-app/v1/exec-plat/home',
  leakWarning: 'https://app2.govee.com/leak/rest/device/v1/warnMessage',
} as const;

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

export async function goveeLogin(username: string, password: string): Promise<GoveeLoginResult> {
  const clientId = generateClientId(username);

  const res = await axios({
    url: GOVEE_API_URLS.login,
    method: 'post',
    headers: {
      'appVersion': GOVEE_APP_VERSION,
      'clientId': clientId,
      'clientType': 1,
      'timestamp': Date.now(),
      'User-Agent': GOVEE_USER_AGENT,
    },
    data: {
      email: username,
      password: password,
      client: clientId,
    },
    timeout: 30000,
  });

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
