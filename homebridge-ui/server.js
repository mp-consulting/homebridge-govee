import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { existsSync, promises as fs } from 'node:fs';
import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import storage from 'node-persist';

import { goveeGetDevices, goveeLogin } from '../dist/utils/govee-api.js';
import {
  goveeGetDiyEffects,
  goveeGetFunctionSupport,
  goveeGetSceneLibrary,
} from '../dist/utils/govee-content.js';
import { getOfflineSceneLibrary } from '../dist/utils/scene-catalogue.js';

class GoveeUiServer extends HomebridgePluginUiServer {
  storageData = null;

  /** Cached Govee login for this settings session, so scene browsing reuses one token. */
  session = null;

  /** Scene icons already fetched and inlined, keyed by source URL. */
  iconCache = new Map();

  constructor() {
    super();

    // Handle device discovery request
    this.onRequest('/discover', this.discoverDevices.bind(this));

    // Handle login test request
    this.onRequest('/test-login', this.testLogin.bind(this));

    // Handle get cached devices request
    this.onRequest('/get-cached-devices', this.getCachedDevices.bind(this));

    // Handle clear cache request
    this.onRequest('/clear-cache', this.clearCache.bind(this));

    // Browse the Govee scene library and DIY effects for one device
    this.onRequest('/scenes', this.getScenes.bind(this));
    this.onRequest('/diys', this.getDiys.bind(this));

    // Ask Govee which modes a device actually supports
    this.onRequest('/device-capabilities', this.getDeviceCapabilities.bind(this));

    // Fetch scene icons in batches and return them inline, so the browser never has
    // to reach a third-party CDN
    this.onRequest('/scene-icons', this.getSceneIcons.bind(this));

    // Initialize storage
    this.initStorage();

    this.ready();
  }

  async initStorage() {
    try {
      const cachePath = join(this.homebridgeStoragePath, 'govee_cache');
      this.storageData = storage.create({ dir: cachePath, forgiveParseErrors: true });
      await this.storageData.init();
    } catch (err) {
      console.error('Failed to initialize storage:', err);
    }
  }

  async discoverDevices(payload) {
    const { username, password, code } = payload || {};

    if (!username || !password) {
      throw new RequestError('Username and password are required', { status: 400 });
    }

    try {
      const loginResult = await this.authenticate({ username, password, code });
      const devices = await goveeGetDevices(loginResult.token, loginResult.clientId);

      return {
        devices: Array.isArray(devices) ? devices.map(device => ({
          deviceId: device.device,
          deviceName: device.deviceName,
          model: device.sku,
          // Needed by the scene, DIY and capability endpoints
          goodsType: device.goodsType,
          pactType: device.pactType,
          pactCode: device.pactCode,
          versionSoft: device.versionSoft,
          versionHard: device.versionHard,
        })) : [],
      };
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Discovery failed';
      throw new RequestError(message, { status: err.response?.status || 500 });
    }
  }

  async testLogin(payload) {
    const { username, password, code } = payload;

    if (!username || !password) {
      throw new RequestError('Username and password are required', { status: 400 });
    }

    try {
      const loginResult = await goveeLogin(username, password, code);
      return {
        success: true,
        message: `Login successful. Account ID: ${loginResult.accountId}`,
      };
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Login failed';
      // A "new device" 2FA challenge is not a hard failure: a code has just been
      // emailed and the user needs to enter it. Flag it so the UI can reveal the
      // verification-code field instead of showing a red error.
      return {
        success: false,
        twoFactorRequired: err.code === 'GOVEE_2FA_REQUIRED',
        twoFactorInvalid: err.code === 'GOVEE_2FA_INVALID',
        message: message,
      };
    }
  }

  /**
   * Log in and return a { token, clientId } pair, reusing the last successful login
   * for the lifetime of this UI session so that browsing scenes for several devices
   * does not re-authenticate each time.
   */
  async authenticate({ username, password, code }) {
    if (!username || !password) {
      throw new RequestError('Enter your Govee credentials in the Settings tab first.', { status: 400 });
    }
    if (this.session && this.session.username === username) {
      return this.session;
    }
    const login = await goveeLogin(username, password, code);
    this.session = { username, token: login.token, clientId: login.clientId };
    return this.session;
  }

  /**
   * Turn a config-UI payload into the device reference the Govee content endpoints
   * expect. `goodsType` comes from the discovery cache the plugin writes at startup.
   */
  toDeviceRef(payload) {
    return {
      sku: (payload.model || '').toUpperCase(),
      device: payload.deviceId,
      goodsType: payload.goodsType,
      pactType: payload.pactType,
      pactCode: payload.pactCode,
      versionSoft: payload.versionSoft,
      versionHard: payload.versionHard,
    };
  }

  /**
   * Return the scene library for one device.
   *
   * Falls back to the catalogue bundled with the plugin when Govee cannot be reached
   * or no credentials are configured, so the picker still works offline. The response
   * says which source was used.
   */
  async getScenes(payload = {}) {
    const ref = this.toDeviceRef(payload);
    if (!ref.sku || !ref.device) {
      throw new RequestError('A device ID and model are required to load scenes.', { status: 400 });
    }

    try {
      const { token, clientId } = await this.authenticate(payload);
      return await goveeGetSceneLibrary(token, clientId, ref);
    } catch (err) {
      const offline = getOfflineSceneLibrary(ref.sku, ref.device);
      if (offline) {
        return { ...offline, warning: err.message || 'Could not reach Govee; showing the bundled scene list.' };
      }
      throw new RequestError(err.message || 'Could not load scenes', { status: err.response?.status || 500 });
    }
  }

  /**
   * Return the account's DIY effects for one device. DIY effects only exist in the
   * cloud, so there is no offline fallback.
   */
  async getDiys(payload = {}) {
    const ref = this.toDeviceRef(payload);
    if (!ref.sku || !ref.device) {
      throw new RequestError('A device ID and model are required to load DIY effects.', { status: 400 });
    }
    try {
      const { token, clientId } = await this.authenticate(payload);
      return { diys: await goveeGetDiyEffects(token, clientId, ref) };
    } catch (err) {
      throw new RequestError(err.message || 'Could not load DIY effects', { status: err.response?.status || 500 });
    }
  }

  /**
   * Ask Govee which modes a device supports so the UI can hide the ones it lacks.
   * Returns `modes: null` when the answer is unknown, which the UI treats as "show
   * everything" rather than "show nothing".
   */
  async getDeviceCapabilities(payload = {}) {
    const ref = this.toDeviceRef(payload);
    if (!ref.sku || !ref.device) {
      throw new RequestError('A device ID and model are required.', { status: 400 });
    }
    try {
      const { token, clientId } = await this.authenticate(payload);
      const support = await goveeGetFunctionSupport(token, clientId, ref);
      return { modes: support.modes.length > 0 ? support.modes : null, modeIds: support.modeIds };
    } catch {
      return { modes: null, modeIds: [] };
    }
  }

  /**
   * Fetch one Govee scene icon as a data URI, or `null` if it cannot be had.
   *
   * Only Govee's own image hosts are accepted, so a crafted config cannot turn this
   * into an open proxy.
   */
  async fetchSceneIcon(url) {
    if (this.iconCache.has(url)) {
      return this.iconCache.get(url);
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    const allowedHosts = ['d1f2504ijhdyjw.cloudfront.net', 's3.amazonaws.com', 'app.govee.com'];
    if (parsed.protocol !== 'https:' || !allowedHosts.includes(parsed.hostname)) {
      return null;
    }

    const response = await fetch(parsed.toString());
    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const dataUri = `data:${contentType};base64,${buffer.toString('base64')}`;

    // Bound the cache so a long settings session cannot grow it without limit
    if (this.iconCache.size > 800) {
      this.iconCache.clear();
    }
    this.iconCache.set(url, dataUri);

    return dataUri;
  }

  /**
   * Proxy a batch of Govee scene icons and return them as data URIs.
   *
   * Icons live on a Govee CDN, and each one that has to be proxied shows up as a line
   * in the Homebridge log — a scene library can hold 150 of them, so they are fetched
   * in batches rather than one request per tile. Icons that fail are simply absent
   * from the result; a missing icon is cosmetic and must not fail the whole batch.
   */
  async getSceneIcons(payload = {}) {
    const urls = Array.isArray(payload.urls) ? payload.urls.filter(url => typeof url === 'string') : [];
    if (urls.length === 0) {
      return { icons: {} };
    }

    // Cap the batch so one request cannot tie the server up indefinitely
    const unique = [...new Set(urls)].slice(0, 60);
    const icons = {};

    const results = await Promise.allSettled(unique.map(url => this.fetchSceneIcon(url)));
    unique.forEach((url, index) => {
      const result = results[index];
      if (result.status === 'fulfilled' && result.value) {
        icons[url] = result.value;
      }
    });

    return { icons };
  }

  async getCachedDevices() {
    try {
      if (!this.storageData) {
        await this.initStorage();
      }

      if (!this.storageData) {
        return { devices: [] };
      }

      const storedData = await this.storageData.getItem('Govee_Discovered_Devices');
      if (!storedData) {
        return { devices: [] };
      }

      const devices = typeof storedData === 'string' ? JSON.parse(storedData) : storedData;
      return { devices: Array.isArray(devices) ? devices : [] };
    } catch (err) {
      console.error('Failed to get cached devices:', err);
      return { devices: [] };
    }
  }

  async clearCache() {
    const results = {
      cacheCleared: false,
      credentialsCleared: false,
      errors: [],
    };

    try {
      const cachePath = join(this.homebridgeStoragePath, 'govee_cache');
      const persistPath = join(this.homebridgeStoragePath, 'persist');
      const iotFile = join(persistPath, 'govee.pfx');

      // Clear govee_cache directory
      if (existsSync(cachePath)) {
        try {
          const files = await fs.readdir(cachePath);
          for (const file of files) {
            await fs.unlink(join(cachePath, file));
          }
          results.cacheCleared = true;
        } catch (err) {
          results.errors.push(`Failed to clear cache: ${err.message}`);
        }
      } else {
        results.cacheCleared = true; // Nothing to clear
      }

      // Clear IoT certificate file
      if (existsSync(iotFile)) {
        try {
          await fs.unlink(iotFile);
          results.credentialsCleared = true;
        } catch (err) {
          results.errors.push(`Failed to clear credentials: ${err.message}`);
        }
      } else {
        results.credentialsCleared = true; // Nothing to clear
      }

      // Reinitialize storage
      this.storageData = null;
      await this.initStorage();

      if (results.errors.length > 0) {
        return {
          success: false,
          message: `Cache partially cleared. Errors: ${results.errors.join(', ')}`,
          ...results,
        };
      }

      return {
        success: true,
        message: 'Cache cleared successfully. Please restart Homebridge to apply changes.',
        ...results,
      };
    } catch (err) {
      console.error('Failed to clear cache:', err);
      return {
        success: false,
        message: `Failed to clear cache: ${err.message}`,
        ...results,
      };
    }
  }
}

// Start the server
(() => new GoveeUiServer())();
