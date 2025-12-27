import { Buffer } from 'node:buffer';

import axios, { type AxiosError } from 'axios';

import type { GoveeHTTPDeviceInfo, GoveeLogging, GoveePluginConfig, HTTPLoginResult } from '../types.js';
import platformConsts from '../utils/constants.js';
import { parseError, sleep } from '../utils/functions.js';
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

export default class HTTPClient {
  private log: GoveeLogging;
  private password: string;
  private token?: string;
  private tokenTTR?: string;
  private username: string;
  private appVersion: string;
  private userAgent: string;
  private clientId: string;
  private base64Tried = false;

  constructor(platform: HTTPPlatformRef) {
    this.log = platform.log;
    this.password = platform.config.password || '';
    this.token = platform.accountToken;
    this.tokenTTR = platform.accountTokenTTR;
    this.username = platform.config.username || '';

    this.appVersion = '5.6.01';
    this.userAgent = `GoveeHome/${this.appVersion} (com.ihoment.GoVeeSensor; build:2; iOS 16.5.0) Alamofire/5.6.4`;

    let clientSuffix = platform.api.hap.uuid.generate(this.username).replace(/-/g, '');
    clientSuffix = clientSuffix.substring(0, clientSuffix.length - 2);
    this.clientId = `hb${clientSuffix}`;
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

  async login(): Promise<HTTPLoginResult> {
    try {
      this.log.debug('[HTTP] Attempting login for user: %s', this.username);

      const res = await axios({
        url: 'https://app2.govee.com/account/rest/account/v1/login',
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
        if (res.data.message && res.data.message.replace(/\s+/g, '') === 'Incorrectpassword') {
          if (this.base64Tried) {
            throw new Error(res.data.message || platformLang.noToken);
          } else {
            this.log.debug('[HTTP] Trying base64 decoded password');
            this.base64Tried = true;
            this.password = Buffer.from(this.password, 'base64')
              .toString('utf8')
              .replace(/\r\n|\n|\r/g, '')
              .trim();
            return await this.login();
          }
        }
        throw new Error(res.data.message || platformLang.noToken);
      }

      this.log.debug('[HTTP] Primary login successful, fetching TTR token...');

      const ttrRes = await axios({
        url: 'https://community-api.govee.com/os/v1/login',
        method: 'post',
        data: {
          email: this.username,
          password: this.password,
        },
        timeout: 30000,
      });

      this.token = res.data.client.token;
      this.tokenTTR = ttrRes.data.data.token;

      this.log.debug('[HTTP] %s. AccountId: %s', platformLang.loginSuccess, res.data.client.accountId);

      this.log.debug('[HTTP] Fetching IoT credentials...');

      const iotRes = await axios({
        url: 'https://app2.govee.com/app/v1/account/iot/key',
        method: 'get',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'appVersion': this.appVersion,
          'clientId': this.clientId,
          'clientType': 1,
          'iotVersion': 0,
          'timestamp': Date.now(),
          'User-Agent': this.userAgent,
        },
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
        this.log.warn('[HTTP] %s [login() - %s].', platformLang.httpRetry, axiosErr.code);
        await sleep(30000);
        return this.login();
      }
      throw err;
    }
  }

  async logout(): Promise<void> {
    try {
      await axios({
        url: 'https://app2.govee.com/account/rest/account/v1/logout',
        method: 'post',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'appVersion': this.appVersion,
          'clientId': this.clientId,
          'clientType': 1,
          'iotVersion': 0,
          'timestamp': Date.now(),
          'User-Agent': this.userAgent,
        },
      });
    } catch (err) {
      this.log.warn('[HTTP] %s %s.', platformLang.logoutFail, parseError(err as Error));
    }
  }

  async getDevices(isSync = true): Promise<GoveeHTTPDeviceInfo[]> {
    try {
      if (!this.token) {
        this.log.debug('[HTTP] getDevices called but no token exists');
        throw new Error(platformLang.noTokenExists);
      }

      this.log.debug('[HTTP] Fetching device list...');

      const res = await axios({
        url: 'https://app2.govee.com/device/rest/devices/v1/list',
        method: 'post',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'appVersion': this.appVersion,
          'clientId': this.clientId,
          'clientType': 1,
          'iotVersion': 0,
          'timestamp': Date.now(),
          'User-Agent': this.userAgent,
        },
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
        this.log.warn('[HTTP] %s [getDevices() - %s].', platformLang.httpRetry, axiosErr.code);
        await sleep(30000);
        return this.getDevices();
      }
      throw err;
    }
  }

  async getTapToRuns(): Promise<unknown[]> {
    const res = await axios({
      url: 'https://app2.govee.com/bff-app/v1/exec-plat/home',
      method: 'get',
      headers: {
        'Authorization': `Bearer ${this.tokenTTR}`,
        'appVersion': this.appVersion,
        'clientId': this.clientId,
        'clientType': 1,
        'iotVersion': 0,
        'timestamp': Date.now(),
        'User-Agent': this.userAgent,
      },
      timeout: 10000,
    });

    if (!res?.data?.data?.components) {
      throw new Error('not a valid response');
    }

    return res.data.data.components;
  }

  async getLeakDeviceWarning(deviceId: string, deviceSku: string): Promise<unknown[]> {
    if (!this.token) {
      throw new Error(platformLang.noTokenExists);
    }

    const res = await axios({
      url: 'https://app2.govee.com/leak/rest/device/v1/warnMessage',
      method: 'post',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'appVersion': this.appVersion,
        'clientId': this.clientId,
        'clientType': 1,
        'iotVersion': 0,
        'timestamp': Date.now(),
        'User-Agent': this.userAgent,
      },
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
