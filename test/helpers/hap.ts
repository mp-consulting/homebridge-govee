/**
 * Shared test harness: real hap-nodejs services and characteristics behind a minimal
 * platform/accessory double, so device handler tests exercise the same validation
 * (value ranges, characteristic warnings) HomeKit applies at runtime.
 */
import * as hap from '@homebridge/hap-nodejs';
import { vi } from 'vitest';

import type { GoveePlatform } from '../../src/platform.js';
import type { GoveeLogging, GoveePlatformAccessoryWithControl } from '../../src/types.js';
import CustomCharacteristics from '../../src/utils/custom-chars.js';
import { platformConsts } from '../../src/utils/index.js';

export { hap };

export function createLog() {
  const log = Object.assign(vi.fn(), {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    debugWarn: vi.fn(),
    success: vi.fn(),
    log: vi.fn(),
    prefix: 'Govee',
  });
  return log as typeof log & GoveeLogging;
}

export function createApi() {
  return {
    hap,
    on: vi.fn(),
    versionGreaterOrEqual: () => true,
    serverVersion: 'test',
    user: { storagePath: () => '/tmp/homebridge-govee-test' },
    platformAccessory: hap.Accessory,
    registerPlatformAccessories: vi.fn(),
    unregisterPlatformAccessories: vi.fn(),
    updatePlatformAccessories: vi.fn(),
  };
}

export type TestAccessory = GoveePlatformAccessoryWithControl & hap.Accessory & {
  log: ReturnType<typeof vi.fn>;
  logWarn: ReturnType<typeof vi.fn>;
  logDebug: ReturnType<typeof vi.fn>;
  logDebugWarn: ReturnType<typeof vi.fn>;
};

export function createAccessory(context: Record<string, unknown> = {}, name = 'Test Device'): TestAccessory {
  const accessory = new hap.Accessory(name, hap.uuid.generate(`${name}-${Math.random()}`)) as unknown as TestAccessory;
  Object.assign(accessory, {
    context: { gvDeviceId: 'AA:BB:CC:DD:EE:FF:00:11', gvModel: 'H6000', ...context },
    log: vi.fn(),
    logWarn: vi.fn(),
    logDebug: vi.fn(),
    logDebugWarn: vi.fn(),
  });
  return accessory;
}

/**
 * A platform double carrying what device handlers read. `sendDeviceUpdate` resolves by default.
 */
export function createPlatform(overrides: Record<string, unknown> = {}) {
  const api = createApi();
  const platform = {
    api,
    log: createLog(),
    config: { ...platformConsts.defaultConfig },
    deviceConf: {} as Record<string, Record<string, unknown>>,
    cusChar: new CustomCharacteristics(api as never) as unknown as Record<string, unknown>,
    eveChar: {},
    eveService: class {
      addEntry = vi.fn();
    },
    storageClientData: false,
    sendDeviceUpdate: vi.fn().mockResolvedValue(true),
    updateAccessoryStatus: vi.fn(),
    ...overrides,
  };
  return platform as typeof platform & GoveePlatform;
}

/**
 * Collect hap-nodejs 'characteristic-warning' events (e.g. out-of-range values) from a service
 */
export function collectWarnings(service: hap.Service): string[] {
  const warnings: string[] = [];
  for (const characteristic of service.characteristics) {
    characteristic.on('characteristic-warning' as never, ((type: string, message: string) => {
      warnings.push(`${characteristic.displayName}: ${type} ${message}`);
    }) as never);
  }
  return warnings;
}
