import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';

import { goveeGetDevices, goveeLogin } from '../dist/utils/govee-api.js';

class GoveeUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    // Handle device discovery request
    this.onRequest('/discover', this.discoverDevices.bind(this));

    // Handle login test request
    this.onRequest('/test-login', this.testLogin.bind(this));

    this.ready();
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
}

// Start the server
(() => new GoveeUiServer())();
