import { join } from 'node:path';
import { existsSync, promises as fs } from 'node:fs';
import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import storage from 'node-persist';

import { goveeGetDevices, goveeLogin } from '../dist/utils/govee-api.js';

class GoveeUiServer extends HomebridgePluginUiServer {
  storageData = null;

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
    const { username, password } = payload || {};

    if (!username || !password) {
      throw new RequestError('Username and password are required', { status: 400 });
    }

    try {
      const loginResult = await goveeLogin(username, password);
      const devices = await goveeGetDevices(loginResult.token, loginResult.clientId);

      return {
        devices: Array.isArray(devices) ? devices.map(device => ({
          deviceId: device.device,
          deviceName: device.deviceName,
          model: device.sku,
        })) : [],
      };
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Discovery failed';
      throw new RequestError(message, { status: err.response?.status || 500 });
    }
  }

  async testLogin(payload) {
    const { username, password } = payload;

    if (!username || !password) {
      throw new RequestError('Username and password are required', { status: 400 });
    }

    try {
      const loginResult = await goveeLogin(username, password);
      return {
        success: true,
        message: `Login successful. Account ID: ${loginResult.accountId}`,
      };
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Login failed';
      return {
        success: false,
        message: message,
      };
    }
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
