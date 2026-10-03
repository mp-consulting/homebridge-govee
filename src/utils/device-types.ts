import platformConsts from './constants.js';

/** Config array a device's settings live in */
export type DeviceConfigKey = 'lightDevices' | 'switchDevices' | 'thermoDevices' | 'leakDevices' |
  'fanDevices' | 'heaterDevices' | 'humidifierDevices' | 'dehumidifierDevices' |
  'purifierDevices' | 'diffuserDevices' | 'kettleDevices' | 'iceMakerDevices';

type ModelList = keyof typeof platformConsts.models;

/**
 * Which config array each model list belongs to. This is the single source for the mapping:
 * the platform uses it directly and the config UI gets a generated copy (scripts/generate-ui-models.js).
 */
export const MODEL_CONFIG_KEYS: ReadonlyArray<readonly [ModelList, DeviceConfigKey]> = [
  ['switchSingle', 'switchDevices'],
  ['switchDouble', 'switchDevices'],
  ['switchTriple', 'switchDevices'],
  ['sensorLeak', 'leakDevices'],
  ['sensorThermo', 'thermoDevices'],
  ['sensorThermo4', 'thermoDevices'],
  ['sensorMonitor', 'thermoDevices'],
  ['sensorButton', 'thermoDevices'],
  ['sensorContact', 'thermoDevices'],
  ['sensorPresence', 'thermoDevices'],
  ['fan', 'fanDevices'],
  ['heater1', 'heaterDevices'],
  ['heater2', 'heaterDevices'],
  ['humidifier', 'humidifierDevices'],
  ['dehumidifier', 'dehumidifierDevices'],
  ['purifier', 'purifierDevices'],
  ['diffuser', 'diffuserDevices'],
  ['iceMaker', 'iceMakerDevices'],
  ['kettle', 'kettleDevices'],
  ['rgb', 'lightDevices'],
];

/**
 * The config array for a model SKU. Unknown models are treated as lights.
 */
export function getDeviceTypeFromModel(model: string | undefined): DeviceConfigKey {
  const sku = (model ?? '').toUpperCase();
  const models = platformConsts.models as Record<ModelList, string[]>;
  const match = MODEL_CONFIG_KEYS.find(([list]) => models[list].includes(sku));
  return match ? match[1] : 'lightDevices';
}
