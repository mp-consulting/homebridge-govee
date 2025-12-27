import { join } from 'node:path';
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
        devices: devices.map(device => ({
          deviceId: device.device,
          deviceName: device.deviceName,
          model: device.sku,
        })),
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

      const devices = JSON.parse(storedData);
      return { devices: devices || [] };
    } catch (err) {
      console.error('Failed to get cached devices:', err);
      return { devices: [] };
    }
  }
}

// Start the server
(() => new GoveeUiServer())();
