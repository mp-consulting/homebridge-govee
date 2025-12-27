import crypto from 'crypto';

import axios from 'axios';

export const GOVEE_APP_VERSION = '5.6.01';
export const GOVEE_USER_AGENT = `GoveeHome/${GOVEE_APP_VERSION} (com.ihoment.GoVeeSensor; build:2; iOS 16.5.0) Alamofire/5.6.4`;

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

export async function goveeLogin(username: string, password: string): Promise<GoveeLoginResult> {
  const clientId = generateClientId(username);

  const res = await axios({
    url: 'https://app2.govee.com/account/rest/account/v1/login',
    method: 'post',
    data: {
      email: username,
      password: password,
      client: clientId,
    },
    timeout: 30000,
  });

  if (!res.data || !res.data.client || !res.data.client.token) {
    throw new Error(res.data?.message || 'Login failed - no token received');
  }

  return {
    token: res.data.client.token,
    clientId: clientId,
    accountId: res.data.client.accountId,
  };
}

export async function goveeGetDevices(token: string, clientId: string): Promise<GoveeDevice[]> {
  const res = await axios({
    url: 'https://app2.govee.com/device/rest/devices/v1/list',
    method: 'post',
    headers: {
      'Authorization': `Bearer ${token}`,
      'appVersion': GOVEE_APP_VERSION,
      'clientId': clientId,
      'clientType': 1,
      'iotVersion': 0,
      'timestamp': Date.now(),
      'User-Agent': GOVEE_USER_AGENT,
    },
    timeout: 30000,
  });

  if (!res.data || !res.data.devices) {
    return [];
  }

  return res.data.devices;
}
