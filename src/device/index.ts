// Base class and registry
export { GoveeDeviceBase } from './base.js';
export {
  registerDeviceHandler,
  registerModelsForCategory,
  getCategoryForModel,
  getDeviceHandler,
  getDeviceHandlerForModel,
  createDeviceInstance,
  initializeModelMappings,
  getRegisteredCategories,
  isModelSupported,
} from './registry.js';
export type { DeviceCategory, DeviceHandlerClass } from './registry.js';

// Device implementations
export { LightDevice } from './light.js';
export { OutletSingleDevice } from './outlet-single.js';
export { OutletDoubleDevice } from './outlet-double.js';
export { OutletTripleDevice } from './outlet-triple.js';
export { SwitchSingleDevice } from './switch-single.js';
export { SwitchDoubleDevice } from './switch-double.js';
export { SwitchTripleDevice } from './switch-triple.js';
export { SensorThermoDevice } from './sensor-thermo.js';
export { SensorLeakDevice } from './sensor-leak.js';
export { FanDevice } from './fan.js';
export { HumidifierDevice } from './humidifier.js';
export { HeaterSingleDevice } from './heater-single.js';

// Initialize device handlers
import { registerDeviceHandler, initializeModelMappings } from './registry.js';
import { LightDevice } from './light.js';
import { OutletSingleDevice } from './outlet-single.js';
import { OutletDoubleDevice } from './outlet-double.js';
import { OutletTripleDevice } from './outlet-triple.js';
import { SwitchSingleDevice } from './switch-single.js';
import { SwitchDoubleDevice } from './switch-double.js';
import { SwitchTripleDevice } from './switch-triple.js';
import { SensorThermoDevice } from './sensor-thermo.js';
import { SensorLeakDevice } from './sensor-leak.js';
import { FanDevice } from './fan.js';
import { HumidifierDevice } from './humidifier.js';
import { HeaterSingleDevice } from './heater-single.js';

/**
 * Register all device handlers with the registry.
 * This must be called before creating device instances.
 */
export function initializeDeviceHandlers(): void {
  // Initialize model mappings from constants
  initializeModelMappings();

  // Register device handlers
  registerDeviceHandler('light', LightDevice);
  registerDeviceHandler('outletSingle', OutletSingleDevice);
  registerDeviceHandler('outletDouble', OutletDoubleDevice);
  registerDeviceHandler('outletTriple', OutletTripleDevice);
  registerDeviceHandler('switchSingle', SwitchSingleDevice);
  registerDeviceHandler('switchDouble', SwitchDoubleDevice);
  registerDeviceHandler('switchTriple', SwitchTripleDevice);
  registerDeviceHandler('sensorThermo', SensorThermoDevice);
  registerDeviceHandler('sensorLeak', SensorLeakDevice);
  registerDeviceHandler('fan', FanDevice);
  registerDeviceHandler('humidifier', HumidifierDevice);
  registerDeviceHandler('heater', HeaterSingleDevice);

  // TODO: Add more device handlers as they are migrated
  // registerDeviceHandler('cooler', CoolerDevice);
  // registerDeviceHandler('dehumidifier', DehumidifierDevice);
  // registerDeviceHandler('purifier', PurifierDevice);
  // registerDeviceHandler('diffuser', DiffuserDevice);
  // registerDeviceHandler('kettle', KettleDevice);
  // registerDeviceHandler('iceMaker', IceMakerDevice);
  // registerDeviceHandler('sensorContact', SensorContactDevice);
  // registerDeviceHandler('sensorPresence', SensorPresenceDevice);
  // registerDeviceHandler('sensorButton', SensorButtonDevice);
  // registerDeviceHandler('sensorMonitor', SensorMonitorDevice);
  // registerDeviceHandler('tap', TapDevice);
  // registerDeviceHandler('valve', ValveDevice);
  // registerDeviceHandler('tv', TVDevice);
  // registerDeviceHandler('template', TemplateDevice);
}
