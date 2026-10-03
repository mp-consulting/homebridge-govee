export { createDeviceInstance } from './registry.js';

// Initialize device handlers
import { registerDeviceHandler, registerModelHandler, initializeModelMappings } from './registry.js';
import { LightDevice } from './light.js';
import { OutletSingleDevice } from './outlet-single.js';
import { OutletDoubleDevice, OutletTripleDevice, SwitchDoubleDevice, SwitchTripleDevice } from './multi-channel.js';
import { SwitchSingleDevice } from './switch-single.js';
import { SensorThermoDevice } from './sensor-thermo.js';
import { SensorLeakDevice } from './sensor-leak.js';
import { FanDevice } from './fan.js';
import { FanLightDevice } from './fan-light.js';
import { HumidifierDevice } from './humidifier.js';
import { HumidifierH7160Device } from './humidifier-h7160.js';
import { HumidifierH7142Device } from './humidifier-h7142.js';
import { HeaterSingleDevice } from './heater-single.js';
import { Heater1aDevice } from './heater1a.js';
import { Heater1bDevice } from './heater1b.js';
import { Heater2Device } from './heater2.js';
import { CoolerSingleDevice } from './cooler-single.js';
import { DehumidifierDevice } from './dehumidifier.js';
import { DiffuserDevice } from './diffuser.js';
import { PurifierDevice } from './purifier.js';
import { PurifierH7126Device } from './purifier-h7126.js';
import { PurifierH7122Device } from './purifier-h7122.js';
import { PurifierH7120Device } from './purifier-h7120.js';
import { PurifierH7123Device } from './purifier-h7123.js';
import { IceMakerDevice } from './ice-maker.js';
import { KettleDevice } from './kettle.js';
import { SensorButtonDevice } from './sensor-button.js';
import { SensorContactDevice } from './sensor-contact.js';
import { SensorPresenceDevice } from './sensor-presence.js';
import { SensorMonitorDevice } from './sensor-monitor.js';
import { SensorThermoSwitchDevice } from './sensor-thermo-switch.js';
import { TapDevice } from './tap.js';
import { ValveDevice } from './valve.js';
import { TVDevice } from './tv.js';
import { LightSwitchDevice } from './light-switch.js';
import { SensorThermo4Device } from './sensor-thermo4.js';
import { TemplateDevice } from './template.js';

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

  // Model-specific fan handlers (12-speed fans with light)
  registerModelHandler('H7105', FanLightDevice);
  registerModelHandler('H7107', FanLightDevice);

  registerDeviceHandler('humidifier', HumidifierDevice);

  // Model-specific humidifier handlers
  registerModelHandler('H7160', HumidifierH7160Device);
  registerModelHandler('H7142', HumidifierH7142Device);

  registerDeviceHandler('heater', HeaterSingleDevice);

  // Model-specific heater handlers
  // H7130/H713A/H713B/H713C use Heater1aDevice (Fanv2 with speed modes)
  // Config-based override to Heater1bDevice (with temp reporting) is in createDeviceInstance
  registerModelHandler('H7130', Heater1aDevice);
  registerModelHandler('H713A', Heater1aDevice);
  registerModelHandler('H713B', Heater1aDevice);
  registerModelHandler('H713C', Heater1aDevice);

  // H7131/H7132 use Heater2Device (with night light and color control)
  registerModelHandler('H7131', Heater2Device);
  registerModelHandler('H7132', Heater2Device);

  // Heater1b is used as a config-based override (tempReporting=true) in createDeviceInstance
  registerDeviceHandler('heater1b', Heater1bDevice);

  registerDeviceHandler('cooler', CoolerSingleDevice);
  registerDeviceHandler('dehumidifier', DehumidifierDevice);
  registerDeviceHandler('diffuser', DiffuserDevice);
  registerDeviceHandler('purifier', PurifierDevice);

  // Model-specific purifier handlers (with speed control)
  registerModelHandler('H7121', PurifierH7120Device); // 4-speed, night light, lock, display
  registerModelHandler('H7120', PurifierH7120Device); // 4-speed, night light, lock, display
  registerModelHandler('H7122', PurifierH7122Device); // 5-speed, air quality PM2.5, lock, display
  registerModelHandler('H7123', PurifierH7123Device); // 5-speed, air quality (no PM2.5), lock, display
  registerModelHandler('H7124', PurifierH7123Device); // Same as H7123
  registerModelHandler('H7126', PurifierH7126Device); // 3-speed, lock, display
  registerModelHandler('H7127', PurifierH7126Device); // 3-speed, lock, display
  registerModelHandler('H7128', PurifierH7126Device); // Same as H7127
  registerModelHandler('H7129', PurifierH7126Device); // Same as H7127
  registerModelHandler('H712C', PurifierH7126Device); // Same as H7127

  registerDeviceHandler('kettle', KettleDevice);
  registerDeviceHandler('iceMaker', IceMakerDevice);
  registerDeviceHandler('sensorButton', SensorButtonDevice);
  registerDeviceHandler('sensorContact', SensorContactDevice);
  registerDeviceHandler('sensorPresence', SensorPresenceDevice);
  registerDeviceHandler('sensorMonitor', SensorMonitorDevice);
  registerDeviceHandler('sensorThermoSwitch', SensorThermoSwitchDevice);
  registerDeviceHandler('tap', TapDevice);
  registerDeviceHandler('valve', ValveDevice);
  registerDeviceHandler('tv', TVDevice);
  registerDeviceHandler('lightSwitch', LightSwitchDevice);
  registerDeviceHandler('sensorThermo4', SensorThermo4Device);
  registerDeviceHandler('template', TemplateDevice);
}
