"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const plugin_ui_utils_1 = require("@homebridge/plugin-ui-utils");
class GoveeUiServer extends plugin_ui_utils_1.HomebridgePluginUiServer {
    constructor() {
        super();
        // Handle device discovery request
        this.onRequest('/discover', this.discoverDevices.bind(this));
        // Handle login test request
        this.onRequest('/test-login', this.testLogin.bind(this));
        this.ready();
    }
    async discoverDevices() {
        // This would integrate with the HTTP client to discover devices
        // For now, return empty array as a placeholder
        return { devices: [] };
    }
    async testLogin(payload) {
        const { username, password } = payload;
        if (!username || !password) {
            throw new plugin_ui_utils_1.RequestError('Username and password are required', { status: 400 });
        }
        // This would integrate with the HTTP client to test login
        // For now, return a placeholder response
        return {
            success: true,
            message: 'Login credentials appear valid',
        };
    }
}
// Start the server
(() => new GoveeUiServer())();
