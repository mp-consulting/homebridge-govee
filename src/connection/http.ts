import axios, { type AxiosError } from 'axios';

import type { GoveeHTTPDeviceInfo, GoveeLogging, GoveePluginConfig, HTTPLoginResult } from '../types.js';
import platformConsts from '../utils/constants.js';
import { parseError, sleep } from '../utils/functions.js';
import { GOVEE_API_URLS, goveeHeaders } from '../utils/govee-api.js';
import platformLang from '../utils/lang-en.js';

interface HTTPPlatformRef {
  log: GoveeLogging;
  config: GoveePluginConfig;
  accountToken?: string;
  accountTokenTTR?: string;
  api: {
    hap: {
      uuid: {
        generate(input: string): string;
      };
    };
  };
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30000;

export default class HTTPClient {
  private log: GoveeLogging;
  private password: string;
  private token?: string;
  private tokenTTR?: string;
  private username: string;
  private clientId: string;

  constructor(platform: HTTPPlatformRef) {
    this.log = platform.log;
    this.password = platform.config.password || '';
    this.token = platform.accountToken;
    this.tokenTTR = platform.accountTokenTTR;
    this.username = platform.config.username || '';

    let clientSuffix = platform.api.hap.uuid.generate(this.username).replace(/-/g, '');
    clientSuffix = clientSuffix.substring(0, clientSuffix.length - 2);
    this.clientId = `hb${clientSuffix}`;
  }

  private headers(token?: string): Record<string, string | number> {
    return goveeHeaders(token || this.token!, this.clientId);
  }

  /**
   * Set the token from cached credentials
   */
  setToken(token: string, tokenTTR?: string): void {
    this.token = token;
    if (tokenTTR) {
      this.tokenTTR = tokenTTR;
    }
  }

  async login(retryCount = 0): Promise<HTTPLoginResult> {
    try {
      this.log.debug('[HTTP] Attempting login for user: %s', this.username);

      const res = await axios({
        url: GOVEE_API_URLS.login,
        method: 'post',
        data: {
          email: this.username,
          password: this.password,
          client: this.clientId,
        },
        timeout: 30000,
      });

      this.log.debug('[HTTP] Login response status: %s', res.status);

      if (!res.data) {
        this.log.debug('[HTTP] Login response has no data');
        throw new Error(platformLang.noToken);
      }

      if (!res.data.client || !res.data.client.token) {
        this.log.debug('[HTTP] Login response missing client/token. Message: %s', res.data.message || 'none');
        throw new Error(res.data.message || platformLang.noToken);
      }

      this.log.debug('[HTTP] Primary login successful, fetching TTR token...');

      const ttrRes = await axios({
        url: GOVEE_API_URLS.loginTTR,
        method: 'post',
        data: {
          email: this.username,
          password: this.password,
        },
        timeout: 30000,
      });

      this.token = res.data.client.token;
      this.tokenTTR = ttrRes.data?.data?.token;

      this.log.debug('[HTTP] %s. AccountId: %s', platformLang.loginSuccess, res.data.client.accountId);

      this.log.debug('[HTTP] Fetching IoT credentials...');

      const iotRes = await axios({
        url: GOVEE_API_URLS.iotKey,
        method: 'get',
        headers: this.headers(),
      });

      this.log.debug('[HTTP] IoT credentials received. Endpoint: %s', iotRes.data.data.endpoint);

      return {
        accountId: res.data.client.accountId,
        client: this.clientId,
        endpoint: iotRes.data.data.endpoint,
        iot: iotRes.data.data.p12,
        iotPass: iotRes.data.data.p12Pass,
        token: res.data.client.token,
        tokenTTR: this.tokenTTR!,
        topic: res.data.client.topic,
      };
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.code && platformConsts.httpRetryCodes.includes(axiosErr.code)) {
        if (retryCount >= MAX_RETRIES) {
          this.log.warn('[HTTP] login() failed after %d retries [%s].', MAX_RETRIES, axiosErr.code);
          throw err;
        }
        this.log.warn('[HTTP] %s [login() - %s] (attempt %d/%d).', platformLang.httpRetry, axiosErr.code, retryCount + 1, MAX_RETRIES);
        await sleep(RETRY_DELAY_MS);
        return this.login(retryCount + 1);
      }
      throw err;
    }
  }

  async logout(): Promise<void> {
    try {
      await axios({
        url: GOVEE_API_URLS.logout,
        method: 'post',
        headers: this.headers(),
      });
    } catch (err) {
      this.log.warn('[HTTP] %s %s.', platformLang.logoutFail, parseError(err as Error));
    }
  }

  async getDevices(isSync = true, retryCount = 0): Promise<GoveeHTTPDeviceInfo[]> {
    try {
      if (!this.token) {
        this.log.debug('[HTTP] getDevices called but no token exists');
        throw new Error(platformLang.noTokenExists);
      }

      this.log.debug('[HTTP] Fetching device list...');

      const res = await axios({
        url: GOVEE_API_URLS.devices,
        method: 'post',
        headers: this.headers(),
        timeout: 30000,
      });

      this.log.debug('[HTTP] Device list response status: %s', res.status);

      if (!res.data || !res.data.devices) {
        this.log.debug('[HTTP] Device list response has no devices array. Response: %s', JSON.stringify(res.data).substring(0, 200));
        throw new Error(platformLang.noDevices);
      }

      const deviceCount = res.data.devices.length;
      this.log.debug('[HTTP] Found %d devices', deviceCount);

      if (deviceCount > 0) {
        res.data.devices.forEach((device: GoveeHTTPDeviceInfo, index: number) => {
          this.log.debug('[HTTP] Device %d: %s (%s) - %s', index + 1, device.deviceName, device.sku, device.device);
        });
      }

      return res.data.devices || [];
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (!isSync && axiosErr.code && platformConsts.httpRetryCodes.includes(axiosErr.code)) {
        if (retryCount >= MAX_RETRIES) {
          this.log.warn('[HTTP] getDevices() failed after %d retries [%s].', MAX_RETRIES, axiosErr.code);
          throw err;
        }
        this.log.warn('[HTTP] %s [getDevices() - %s] (attempt %d/%d).', platformLang.httpRetry, axiosErr.code, retryCount + 1, MAX_RETRIES);
        await sleep(RETRY_DELAY_MS);
        return this.getDevices(isSync, retryCount + 1);
      }
      throw err;
    }
  }

  async getLeakDeviceWarning(deviceId: string, deviceSku: string): Promise<unknown[]> {
    if (!this.token) {
      throw new Error(platformLang.noTokenExists);
    }

    const res = await axios({
      url: GOVEE_API_URLS.leakWarning,
      method: 'post',
      headers: this.headers(),
      data: {
        device: deviceId.replaceAll(':', ''),
        limit: 50,
        sku: deviceSku,
      },
      timeout: 10000,
    });

    if (!res?.data?.data) {
      throw new Error(platformLang.noDevices);
    }

    return res.data.data;
  }
}
