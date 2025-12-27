import type { API } from 'homebridge';

import { GoveePlatform, PLATFORM_NAME } from './platform.js';

/**
 * This method registers the platform with Homebridge
 */
export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, GoveePlatform);
};
