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
export { Heater1aDevice } from './heater1a.js';
export { Heater1bDevice } from './heater1b.js';
export { Heater2Device } from './heater2.js';
export { CoolerSingleDevice } from './cooler-single.js';
export { DehumidifierDevice } from './dehumidifier.js';
export { DiffuserDevice } from './diffuser.js';
export { PurifierDevice } from './purifier.js';
export { IceMakerDevice } from './ice-maker.js';
export { KettleDevice } from './kettle.js';
export { SensorButtonDevice } from './sensor-button.js';
export { SensorContactDevice } from './sensor-contact.js';
export { SensorPresenceDevice } from './sensor-presence.js';
export { SensorMonitorDevice } from './sensor-monitor.js';

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
import { Heater1aDevice } from './heater1a.js';
import { Heater1bDevice } from './heater1b.js';
import { Heater2Device } from './heater2.js';
import { CoolerSingleDevice } from './cooler-single.js';
import { DehumidifierDevice } from './dehumidifier.js';
import { DiffuserDevice } from './diffuser.js';
import { PurifierDevice } from './purifier.js';
import { IceMakerDevice } from './ice-maker.js';
import { KettleDevice } from './kettle.js';
import { SensorButtonDevice } from './sensor-button.js';
import { SensorContactDevice } from './sensor-contact.js';
import { SensorPresenceDevice } from './sensor-presence.js';
import { SensorMonitorDevice } from './sensor-monitor.js';

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
  registerDeviceHandler('heater1a', Heater1aDevice);
  registerDeviceHandler('heater1b', Heater1bDevice);
  registerDeviceHandler('heater2', Heater2Device);
  registerDeviceHandler('cooler', CoolerSingleDevice);
  registerDeviceHandler('dehumidifier', DehumidifierDevice);
  registerDeviceHandler('diffuser', DiffuserDevice);
  registerDeviceHandler('purifier', PurifierDevice);
  registerDeviceHandler('kettle', KettleDevice);
  registerDeviceHandler('iceMaker', IceMakerDevice);
  registerDeviceHandler('sensorButton', SensorButtonDevice);
  registerDeviceHandler('sensorContact', SensorContactDevice);
  registerDeviceHandler('sensorPresence', SensorPresenceDevice);
  registerDeviceHandler('sensorMonitor', SensorMonitorDevice);

  // TODO: Add more device handlers as they are migrated
  // registerDeviceHandler('tap', TapDevice);
  // registerDeviceHandler('valve', ValveDevice);
  // registerDeviceHandler('tv', TVDevice);
  // registerDeviceHandler('template', TemplateDevice);
}
