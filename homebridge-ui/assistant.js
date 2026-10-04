import { registerAiRoutes } from '@mp-consulting/homebridge-ai-kit/plugin';

/**
 * Govee background the Assistant gets with every request from this plugin's
 * settings UI. Keep it short: it is sent with each prompt.
 */
export const GOVEE_AI_CONTEXT = [
  'The plugin bridges Govee lights, outlets, sensors, fans, heaters, humidifiers, purifiers, diffusers, kettles and',
  'ice makers to HomeKit. It has four connections, tried in this order for commands: LAN, AWS IoT (cloud), then',
  'Bluetooth (BLE); HTTP polling of the Govee cloud ("httpRefreshTime", default and minimum 30 s) refreshes state. LAN uses',
  'the Govee LAN API: multicast discovery on 239.255.255.250 (scan port 4001, replies on 4002, commands to port',
  '4003); it needs the device on the same network or a "Custom IP Address" (customIPAddress) plus a DHCP reservation',
  'across VLANs, and only models that support LAN control. LAN and BLE work without Govee credentials; the cloud',
  'needs the Govee account email and password. The first login from the plugin triggers Govee\'s new-device check',
  '(app status 454): Govee emails a one-time verification code to enter in "Verification Code", then test or restart',
  'again; "The Govee verification code was not accepted" means a wrong or expired code (clear it to get a new one).',
  '"Govee login failed: <message> (HTTP n)" or "without an account token" usually means wrong credentials, or the',
  'account needs attention in the Govee Home app (verification, new terms). "account token was rejected, logging in',
  'again" is normal token renewal. "Unable to reach Govee, retrying in 30 seconds" is a network problem to',
  'app2.govee.com. "not connected to AWS" means the AWS IoT session is down (awsDisable, or the IoT certificate in',
  'persist/govee.pfx is missing; Clear Cache removes it and the cached devices, then restart Homebridge). "no',
  'connection method available" means a device has no working LAN, AWS or BLE path. BLE needs Bluetooth hardware',
  'and the optional @stoprocent/noble native module (works best on a Raspberry Pi); "Bluetooth not available on',
  'this system" disables it. "ignoreMatter" skips Matter-capable models. Devices are identified by deviceId',
  '(colon-separated hex) and model (SKU such as H6159); "is not currently supported" means an unknown model. The',
  'Scene Library falls back to a bundled catalogue without credentials. Never ask the user for their password,',
  'verification code, tokens or API keys.',
].join(' ');

export const ASSISTANT_PLUGIN_NAME = '@mp-consulting/homebridge-govee';

/**
 * Adds the Assistant routes (/ai/status, /ai/explain, /ai/ask, /ai/config) to the
 * plugin UI server. The provider settings come from the shared `HomebridgeAiKit`
 * block in config.json; the key never reaches the browser.
 *
 * `options` is passed through to `registerAiRoutes` (tests inject a provider).
 */
export function registerAssistant(server, options = {}) {
  registerAiRoutes(server, {
    pluginName: ASSISTANT_PLUGIN_NAME,
    systemContext: GOVEE_AI_CONTEXT,
    ...options,
  });
}
