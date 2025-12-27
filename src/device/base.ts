import type {
  API,
  Characteristic,
  CharacteristicValue,
  HAPStatus,
  Service,
  WithUUID,
} from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, DeviceCommand, ExternalUpdateParams } from '../types.js';
import { platformLang } from '../utils/index.js';
import { parseError } from '../utils/functions.js';

// HAP types extracted from the API
type HapCharacteristic = API['hap']['Characteristic'];
type HapService = API['hap']['Service'];

/**
 * Base class for all Govee device handlers.
 * Provides common functionality for device initialization, caching, and updates.
 */
export abstract class GoveeDeviceBase {
  // Platform references
  protected readonly platform: GoveePlatform;
  protected readonly accessory: GoveePlatformAccessoryWithControl;
  protected readonly hapChar: HapCharacteristic;
  protected readonly hapServ: HapService;

  // Common cache values
  protected cacheState: 'on' | 'off' = 'off';
  protected initialised = false;

  // Device configuration
  protected readonly deviceConf: Record<string, unknown>;

  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    this.platform = platform;
    this.accessory = accessory;
    this.hapChar = platform.api.hap.Characteristic;
    this.hapServ = platform.api.hap.Service;

    // Get device-specific configuration
    this.deviceConf = platform.deviceConf[accessory.context.gvDeviceId] || {};
  }

  /**
   * Initialize the device. Called after constructor.
   * Override in subclasses to set up services and characteristics.
   */
  abstract init(): void;

  /**
   * Handle external updates from AWS/LAN/BLE/HTTP.
   * Override in subclasses to process device-specific updates.
   */
  abstract externalUpdate(params: ExternalUpdateParams): void;

  /**
   * Get the primary service for this device.
   * Returns undefined for diagnostic/template devices that don't expose HomeKit services.
   */
  abstract get service(): Service | undefined;

  /**
   * Log device initialization options
   */
  protected logInitOptions(opts: Record<string, unknown>): void {
    this.platform.log.info(
      '[%s] %s %s.',
      this.accessory.displayName,
      platformLang.devInitOpts,
      JSON.stringify(opts),
    );
  }

  /**
   * Send a device update command
   */
  protected async sendDeviceUpdate(command: DeviceCommand): Promise<void> {
    await this.platform.sendDeviceUpdate(this.accessory, command);
  }

  /**
   * Handle errors during internal updates.
   * Logs the error, reverts the characteristic after a timeout, and throws HAP error.
   */
  protected handleUpdateError(
    err: unknown,
    characteristic: Characteristic,
    revertValue: CharacteristicValue,
    revertDelay = 2000,
  ): never {
    this.accessory.logWarn(`${platformLang.devNotUpdated} ${parseError(err)}`);

    setTimeout(() => {
      characteristic.updateValue(revertValue);
    }, revertDelay);

    throw new this.platform.api.hap.HapStatusError(-70402 as HAPStatus);
  }

  /**
   * Remove a service if it exists
   */
  protected removeServiceIfExists(serviceName: keyof HapService): void {
    const ServiceClass = this.hapServ[serviceName] as WithUUID<typeof Service> | undefined;
    if (ServiceClass) {
      const existingService = this.accessory.getService(ServiceClass);
      if (existingService) {
        this.accessory.removeService(existingService);
      }
    }
  }

  /**
   * Remove multiple services at once
   */
  protected removeServices(...serviceNames: (keyof HapService)[]): void {
    for (const serviceName of serviceNames) {
      this.removeServiceIfExists(serviceName);
    }
  }

  /**
   * Get or add a service by service type
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getOrAddService(ServiceClass: any): Service {
    const existing = this.accessory.getService(ServiceClass);
    if (existing) {
      return existing;
    }
    return this.accessory.addService(ServiceClass);
  }

  /**
   * Add a characteristic to a service if it doesn't exist
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected addCharacteristicIfMissing(service: Service, CharacteristicClass: any): Characteristic {
    if (!service.testCharacteristic(CharacteristicClass)) {
      service.addCharacteristic(CharacteristicClass);
    }
    return service.getCharacteristic(CharacteristicClass);
  }

  /**
   * Add a custom characteristic with optional onSet handler
   * Returns the characteristic or undefined if the class doesn't exist
   */
  protected addCustomCharacteristic(
    service: Service,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    characteristicClass: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSetHandler?: (value: any) => Promise<void>,
  ): Characteristic | undefined {
    if (!characteristicClass) {
      return undefined;
    }

    if (!service.testCharacteristic(characteristicClass)) {
      service.addCharacteristic(characteristicClass);
    }

    const characteristic = service.getCharacteristic(characteristicClass);
    if (onSetHandler) {
      characteristic.onSet(onSetHandler);
    }
    return characteristic;
  }

  /**
   * Remove a characteristic from a service if it exists
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected removeCharacteristicIfExists(service: Service, CharacteristicClass: any): void {
    if (service.testCharacteristic(CharacteristicClass)) {
      const char = service.getCharacteristic(CharacteristicClass);
      service.removeCharacteristic(char);
    }
  }

  /**
   * Update the online status of the accessory
   */
  protected updateOnlineStatus(online: boolean): void {
    this.platform.updateAccessoryStatus(this.accessory, online);
  }

  /**
   * Get control flags for this device
   */
  protected get useAwsControl(): boolean {
    return this.accessory.context.useAwsControl ?? false;
  }

  protected get useLanControl(): boolean {
    return this.accessory.context.useLanControl ?? false;
  }

  protected get useBleControl(): boolean {
    return this.accessory.context.useBleControl ?? false;
  }

  protected get hasAwsControl(): boolean {
    return this.accessory.context.hasAwsControl ?? false;
  }

  protected get hasLanControl(): boolean {
    return this.accessory.context.hasLanControl ?? false;
  }

  protected get hasBleControl(): boolean {
    return this.accessory.context.hasBleControl ?? false;
  }

  protected get isBLEOnly(): boolean {
    return !this.useAwsControl && !this.useLanControl;
  }

  /**
   * Get the device model
   */
  protected get deviceModel(): string {
    return this.accessory.context.gvModel ?? '';
  }

  /**
   * Get the device ID
   */
  protected get deviceId(): string {
    return this.accessory.context.gvDeviceId ?? '';
  }
}

export default GoveeDeviceBase;
