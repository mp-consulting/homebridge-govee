import type FakeGatoHistory from 'fakegato-history';
import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';

// ============================================================================
// Configuration Types
// ============================================================================

export interface SceneConfig {
  sceneCode?: string;
  bleCode?: string;
  showAs?: 'default' | 'switch';
}

export interface LightDeviceConfig {
  label?: string;
  deviceId: string;
  ignoreDevice?: boolean;
  showAs?: 'default' | 'switch';
  customAddress?: string;
  customIPAddress?: string;
  adaptiveLightingShift?: number;
  awsBrightnessNoScale?: boolean;
  awsColourMode?: 'default' | 'rgb' | 'redgreenblue';
  brightnessStep?: number;
  scene?: SceneConfig;
  sceneTwo?: SceneConfig;
  sceneThree?: SceneConfig;
  sceneFour?: SceneConfig;
  musicMode?: SceneConfig;
  musicModeTwo?: SceneConfig;
  videoMode?: SceneConfig;
  videoModeTwo?: SceneConfig;
  diyMode?: SceneConfig;
  diyModeTwo?: SceneConfig;
  diyModeThree?: SceneConfig;
  diyModeFour?: SceneConfig;
  segmented?: SceneConfig;
  segmentedTwo?: SceneConfig;
  segmentedThree?: SceneConfig;
  segmentedFour?: SceneConfig;
}

export interface SwitchDeviceConfig {
  label?: string;
  deviceId: string;
  ignoreDevice?: boolean;
  showAs?: 'default' | 'switch' | 'purifier' | 'heater' | 'cooler' | 'tap' | 'valve' | 'audio' | 'box' | 'stick';
  temperatureSource?: string;
}

export interface LeakDeviceConfig {
  label?: string;
  deviceId: string;
  ignoreDevice?: boolean;
  lowBattThreshold?: number;
}

export interface ThermoDeviceConfig {
  label?: string;
  deviceId: string;
  ignoreDevice?: boolean;
  lowBattThreshold?: number;
  showExtraSwitch?: boolean;
}

export interface FanDeviceConfig {
  label?: string;
  deviceId: string;
  ignoreDevice?: boolean;
  hideLight?: boolean;
}

export interface HeaterDeviceConfig {
  label?: string;
  deviceId: string;
  ignoreDevice?: boolean;
  tempReporting?: boolean;
}

export interface BasicDeviceConfig {
  label?: string;
  deviceId: string;
  ignoreDevice?: boolean;
}

export interface KettleDeviceConfig {
  label?: string;
  deviceId: string;
  ignoreDevice?: boolean;
  hideModeGreenTea?: boolean;
  hideModeOolongTea?: boolean;
  hideModeCoffee?: boolean;
  hideModeBlackTea?: boolean;
  showCustomMode1?: boolean;
  showCustomMode2?: boolean;
}

export interface GoveePluginConfig extends PlatformConfig {
  name: string;
  username?: string;
  password?: string;
  ignoreMatter?: boolean;
  disableDeviceLogging?: boolean;
  httpRefreshTime?: number;
  awsDisable?: boolean;
  bleDisable?: boolean;
  bleRefreshTime?: number;
  lanDisable?: boolean;
  lanRefreshTime?: number;
  lanScanInterval?: number;
  bleControlInterval?: number;
  colourSafeMode?: boolean;
  lightDevices?: LightDeviceConfig[];
  switchDevices?: SwitchDeviceConfig[];
  leakDevices?: LeakDeviceConfig[];
  thermoDevices?: ThermoDeviceConfig[];
  fanDevices?: FanDeviceConfig[];
  heaterDevices?: HeaterDeviceConfig[];
  humidifierDevices?: BasicDeviceConfig[];
  dehumidifierDevices?: BasicDeviceConfig[];
  purifierDevices?: BasicDeviceConfig[];
  diffuserDevices?: BasicDeviceConfig[];
  kettleDevices?: KettleDeviceConfig[];
  iceMakerDevices?: BasicDeviceConfig[];
}

export type DeviceConfigEntry =
  | LightDeviceConfig
  | SwitchDeviceConfig
  | LeakDeviceConfig
  | ThermoDeviceConfig
  | FanDeviceConfig
  | HeaterDeviceConfig
  | BasicDeviceConfig
  | KettleDeviceConfig;

// Alias for sensor devices
export type SensorDeviceConfig = LeakDeviceConfig | ThermoDeviceConfig;

// ============================================================================
// Device Types
// ============================================================================

export interface GoveeDevice {
  device: string;
  deviceName: string;
  model: string;
  sku?: string;
  ip?: string;
  isLanDevice?: boolean;
  isLanOnly?: boolean;
  httpInfo?: GoveeHTTPDeviceInfo;
  supportCmds?: string[];
  properties?: Record<string, unknown>;
}

export interface GoveeHTTPDeviceInfo {
  device: string;
  sku: string;
  deviceName: string;
  versionSoft?: string;
  versionHard?: string;
  deviceExt?: {
    extResources?: string;
    deviceSettings?: string;
    lastDeviceData?: string;
  };
}

export interface LANDevice {
  device: string;
  ip: string;
  sku?: string;
  isPendingDiscovery?: boolean;
  isManual?: boolean;
  initialised?: boolean;
}

// ============================================================================
// Accessory Context
// ============================================================================

export interface GoveeAccessoryContext {
  gvDeviceId: string;
  gvModel: string;
  hasAwsControl: boolean;
  useAwsControl: boolean;
  hasBleControl: boolean;
  useBleControl: boolean;
  hasLanControl: boolean;
  useLanControl: boolean;
  firmware: string | false;
  hardware: string | false;
  image: string | false;
  awsTopic?: string;
  awsBrightnessNoScale?: boolean;
  awsColourMode?: string;
  bleAddress?: string;
  bleName?: string;
  supportedCmds?: string[];
  supportedCmdsOpts?: {
    colorTem?: { range?: { min?: number; max?: number } };
    [key: string]: unknown;
  };
  temperatureSource?: string;
  minTemp?: number;
  maxTemp?: number;
  offTemp?: number;
  minHumi?: number;
  maxHumi?: number;
  offHumi?: number;
  sensorAttached?: boolean;
  lanIPAddress?: string;
  ipAddress?: string;  // Alias for lanIPAddress for backwards compatibility
  cacheTarget?: number;
  cacheType?: 'heater' | 'cooler';
  adaptiveLighting?: boolean;
  valveType?: number;
}

export type GoveePlatformAccessory = PlatformAccessory<GoveeAccessoryContext>;

// ============================================================================
// Command Types
// ============================================================================

export type CommandType =
  | 'state'
  | 'stateDual'
  | 'stateOutlet'
  | 'stateHumi'
  | 'statePuri'
  | 'stateHeat'
  | 'multiSync'
  | 'ptReal'
  | 'brightness'
  | 'color'
  | 'colorTem'
  | 'colorwc'
  | 'scene'
  | 'mode'
  | 'speed'
  | 'swing'
  | 'nightLight'
  | 'displayLight'
  | 'lock';

export interface DeviceUpdateParams {
  cmd: CommandType | string;
  value: unknown;
  data?: unknown;
}

export interface AWSParams {
  cmd: string;
  data: Record<string, unknown>;
}

export interface BLEParams {
  cmd: number | string;
  data: number | string | number[];
}

export interface LANParams {
  cmd: string;
  data: Record<string, unknown>;
}

export interface CommandData {
  awsParams?: AWSParams;
  bleParams?: BLEParams;
  lanParams?: LANParams;
}

// Aliases for device handlers
export type DeviceCommand = DeviceUpdateParams;
export type ExternalUpdateParams = DeviceStateUpdate;

// ============================================================================
// Connection Types
// ============================================================================

export interface AWSMessage {
  cmd?: string;
  data?: Record<string, unknown> | string;
  msg?: string | AWSMessage;
  op?: {
    command?: string[];
  };
  state?: Record<string, unknown>;
}

export interface LANMessage {
  msg: {
    cmd: string;
    data: Record<string, unknown>;
  };
}

export interface BLESensorReading {
  uuid: string;
  address: string;
  model: string;
  battery: number;
  humidity: number;
  tempInC: number;
  tempInF: number;
  rssi: number;
}

export interface DecodedSensorValues {
  battery: number;
  humidity: number;
  tempInC: number;
  tempInF: number;
}

// ============================================================================
// Update Types
// ============================================================================

export interface DeviceStateUpdate {
  source?: 'AWS' | 'BLE' | 'LAN' | 'HTTP';
  online?: boolean;
  onOff?: number | boolean;
  brightness?: number;
  color?: { r: number; g: number; b: number };
  rgb?: { r: number; g: number; b: number };  // Alias for color
  colorTemInKelvin?: number;
  kelvin?: number;  // Alias for colorTemInKelvin
  temperature?: number;
  temperatureF?: number;
  setTemperature?: number;
  humidity?: number;
  battery?: number;
  leakDetected?: boolean;
  mode?: number;
  speed?: number;
  nightLight?: boolean;
  displayLight?: boolean;
  lockState?: boolean;
  filterLife?: number;
  airQuality?: number;
  pm25?: number;
  state?: 'on' | 'off';
  commands?: string[];
  [key: string]: unknown;
}

// ============================================================================
// Custom Characteristic Types
// ============================================================================

export interface CustomCharacteristicUUIDs {
  colourMode: string;
  musicMode: string;
  musicModeTwo: string;
  scene: string;
  sceneTwo: string;
  sceneThree: string;
  sceneFour: string;
  diyMode: string;
  diyModeTwo: string;
  diyModeThree: string;
  diyModeFour: string;
  segmented: string;
  segmentedTwo: string;
  segmentedThree: string;
  segmentedFour: string;
  videoMode: string;
  videoModeTwo: string;
  nightLight: string;
  displayLight: string;
}

export interface EveCharacteristicUUIDs {
  currentConsumption: string;
  voltage: string;
  electricCurrent: string;
  lastActivation: string;
}

// ============================================================================
// Device Controller Interface
// ============================================================================

export interface DeviceController {
  externalUpdate(params: DeviceStateUpdate): void;
}

// ============================================================================
// Platform Types
// ============================================================================

export interface GoveePlatform extends DynamicPlatformPlugin {
  readonly api: API;
  readonly log: GoveeLogging;
  readonly config: GoveePluginConfig;
  readonly cusChar: CustomCharacteristics;
  readonly eveChar: EveCharacteristics;
  readonly eveService: ReturnType<typeof FakeGatoHistory>;
  readonly deviceConf: Record<string, Partial<DeviceConfigEntry>>;
  readonly ignoredDevices: string[];
  readonly isBeta: boolean;

  httpClient: HTTPClient | false;
  lanClient: LANClient | false;
  awsClient: AWSClient | false;
  bleClient: BLEClient | false;
  queue: import('p-queue').default;
  storageClientData: boolean;
  storageData?: import('node-persist').LocalStorage;

  sendDeviceUpdate(accessory: GoveePlatformAccessory, params: DeviceUpdateParams): Promise<void>;
  receiveDeviceUpdate(accessory: GoveePlatformAccessory, params: DeviceStateUpdate): void;
}

export interface GoveeLogging extends Logging {
  debug: (msg: string, ...args: unknown[]) => void;
  debugWarn: (msg: string, ...args: unknown[]) => void;
}

// ============================================================================
// Client Interfaces
// ============================================================================

export interface HTTPClient {
  login(): Promise<HTTPLoginResult>;
  logout(): Promise<void>;
  getDevices(isSync?: boolean): Promise<GoveeHTTPDeviceInfo[]>;
  getTapToRuns(): Promise<unknown[]>;
  getLeakDeviceWarning(deviceId: string, deviceSku: string): Promise<unknown[]>;
}

export interface HTTPLoginResult {
  accountId: string;
  client: string;
  endpoint: string;
  iot: string;
  iotPass: string;
  token: string;
  tokenTTR: string;
  topic: string;
}

export interface AWSClient {
  connected: boolean;
  connect(): Promise<void>;
  requestUpdate(accessory: GoveePlatformAccessory): Promise<void>;
  updateDevice(accessory: GoveePlatformAccessory, params: AWSParams): Promise<void>;
}

export interface LANClient {
  lanDevices: LANDevice[];
  getDevices(): Promise<LANDevice[]>;
  updateDevice(accessory: GoveePlatformAccessory, params: LANParams): Promise<void>;
  sendDeviceStateRequest(device: LANDevice): Promise<void>;
  startDevicesPolling(): void;
  startStatusPolling(): void;
  close(): void;
}

export interface BLEClient {
  isScanning: boolean;
  isConnecting: boolean;
  updateDevice(accessory: GoveePlatformAccessory, params: BLEParams): Promise<void>;
  startDiscovery(callback: (reading: BLESensorReading) => void): Promise<void>;
  stopDiscovery(): Promise<void>;
  shutdown(): void;
}

// ============================================================================
// Custom Characteristics Class Types
// ============================================================================

export interface CustomCharacteristics {
  uuids: CustomCharacteristicUUIDs;
  ColourMode: typeof Characteristic;
  MusicMode: typeof Characteristic;
  MusicModeTwo: typeof Characteristic;
  Scene: typeof Characteristic;
  SceneTwo: typeof Characteristic;
  SceneThree: typeof Characteristic;
  SceneFour: typeof Characteristic;
  DiyMode: typeof Characteristic;
  DiyModeTwo: typeof Characteristic;
  DiyModeThree: typeof Characteristic;
  DiyModeFour: typeof Characteristic;
  Segmented: typeof Characteristic;
  SegmentedTwo: typeof Characteristic;
  SegmentedThree: typeof Characteristic;
  SegmentedFour: typeof Characteristic;
  VideoMode: typeof Characteristic;
  VideoModeTwo: typeof Characteristic;
  NightLight: typeof Characteristic;
  DisplayLight: typeof Characteristic;
}

export interface EveCharacteristics {
  uuids: EveCharacteristicUUIDs;
  CurrentConsumption: typeof Characteristic;
  Voltage: typeof Characteristic;
  ElectricCurrent: typeof Characteristic;
  LastActivation: typeof Characteristic;
}

// ============================================================================
// Accessory with Control
// ============================================================================

export interface EveHistoryService {
  addEntry: (entry: Record<string, unknown>) => void;
  getInitialTime: () => number;
}

export interface GoveePlatformAccessoryWithControl extends GoveePlatformAccessory {
  control?: DeviceController;
  eveService?: EveHistoryService;
  log: (msg: string, ...args: unknown[]) => void;
  logWarn: (msg: string, ...args: unknown[]) => void;
  logDebug: (msg: string, ...args: unknown[]) => void;
  logDebugWarn: (msg: string, ...args: unknown[]) => void;
}

// ============================================================================
// IoT Certificate Types
// ============================================================================

export interface IotCertificate {
  cert: string;
  key: string;
}

// ============================================================================
// Re-export homebridge types for convenience
// ============================================================================

export type {
  API,
  Characteristic,
  CharacteristicValue,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';
