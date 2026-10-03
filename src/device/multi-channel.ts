import type { Service } from 'homebridge';
import type { GoveePlatform } from '../platform.js';
import type { GoveePlatformAccessoryWithControl, ExternalUpdateParams } from '../types.js';
import { GoveeDeviceBase } from './base.js';
import { platformLang } from '../utils/index.js';

export type ChannelKind = 'Outlet' | 'Switch';

/**
 * Encode a `stateDual` command for one channel (1-based).
 * The high nibble selects the channels addressed, the low nibble sets which of them are on:
 * channel 1 on = 0x11 (17), off = 0x10 (16); channel 2 on = 0x22 (34); channel 3 on = 0x44 (68).
 */
export function encodeChannelState(channel: number, on: boolean): number {
  const bit = 1 << (channel - 1);
  return (bit << 4) | (on ? bit : 0);
}

/**
 * Decode a `stateDual` report into per-channel states (undefined = channel not addressed).
 * e.g. 0x33 (51) = both of two channels on, 0x70 (112) = all three channels off.
 */
export function decodeChannelStates(value: number, channels: number): Array<'on' | 'off' | undefined> {
  const mask = (value >> 4) & 0x0f;
  const on = value & 0x0f;
  return Array.from({ length: channels }, (_, i) => {
    const bit = 1 << i;
    if (!(mask & bit)) {
      return undefined;
    }
    return on & bit ? 'on' : 'off';
  });
}

/**
 * Multi-channel smart plug / power strip (two or three independently switched channels),
 * exposed as one Outlet or Switch service per channel.
 */
export class MultiChannelDevice extends GoveeDeviceBase {
  private readonly channelServices: Service[] = [];
  private readonly channelStates: Array<'on' | 'off'> = [];

  constructor(
    platform: GoveePlatform,
    accessory: GoveePlatformAccessoryWithControl,
    private readonly channels: 2 | 3,
    private readonly kind: ChannelKind,
  ) {
    super(platform, accessory);
  }

  get service(): Service {
    return this.channelServices[0];
  }

  init(): void {
    const other: ChannelKind = this.kind === 'Outlet' ? 'Switch' : 'Outlet';
    const ServiceType = this.kind === 'Outlet' ? this.hapServ.Outlet : this.hapServ.Switch;

    for (let channel = 1; channel <= this.channels; channel++) {
      // Drop the service of the other kind left over from a previous showAs setting
      const stale = this.accessory.getService(`${other} ${channel}`);
      if (stale) {
        this.accessory.removeService(stale);
      }

      const name = `${this.kind} ${channel}`;
      const service = this.accessory.getService(name)
        || this.accessory.addService(ServiceType, name, `${this.kind.toLowerCase()}${channel}`);
      if (!service.testCharacteristic(this.hapChar.ConfiguredName)) {
        service.addCharacteristic(this.hapChar.ConfiguredName);
        service.updateCharacteristic(this.hapChar.ConfiguredName, name);
      }
      if (!service.testCharacteristic(this.hapChar.ServiceLabelIndex)) {
        service.addCharacteristic(this.hapChar.ServiceLabelIndex);
        service.updateCharacteristic(this.hapChar.ServiceLabelIndex, channel);
      }

      service.getCharacteristic(this.hapChar.On).onSet(async (value) => {
        await this.internalStateUpdate(channel, value as boolean);
      });
      this.channelServices.push(service);
      this.channelStates.push(service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off');
    }

    this.logInitOptions({ showAs: this.kind.toLowerCase(), channels: this.channels });

    this.initialised = true;
  }

  private channelName(channel: number): string {
    const service = this.channelServices[channel - 1];
    return String(service.getCharacteristic(this.hapChar.ConfiguredName).value || `${this.kind} ${channel}`);
  }

  private async internalStateUpdate(channel: number, value: boolean): Promise<void> {
    const index = channel - 1;
    try {
      const newValue = value ? 'on' : 'off';
      if (this.channelStates[index] === newValue) {
        return;
      }

      await this.sendDeviceUpdate({
        cmd: 'stateDual',
        value: encodeChannelState(channel, value),
      });

      this.channelStates[index] = newValue;
      this.accessory.log(`[${this.channelName(channel)}] ${platformLang.curState} [${newValue}]`);
    } catch (err) {
      this.handleUpdateError(
        err,
        this.channelServices[index].getCharacteristic(this.hapChar.On),
        this.channelStates[index] === 'on',
      );
    }
  }

  externalUpdate(params: ExternalUpdateParams): void {
    if (typeof params.stateDual !== 'number') {
      return;
    }

    decodeChannelStates(params.stateDual, this.channels).forEach((newState, index) => {
      if (newState && newState !== this.channelStates[index]) {
        this.channelStates[index] = newState;
        this.channelServices[index].updateCharacteristic(this.hapChar.On, newState === 'on');
        this.accessory.log(`[${this.channelName(index + 1)}] ${platformLang.curState} [${newState}]`);
      }
    });
  }
}


export class OutletDoubleDevice extends MultiChannelDevice {
  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory, 2, 'Outlet');
  }
}

export class OutletTripleDevice extends MultiChannelDevice {
  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory, 3, 'Outlet');
  }
}

export class SwitchDoubleDevice extends MultiChannelDevice {
  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory, 2, 'Switch');
  }
}

export class SwitchTripleDevice extends MultiChannelDevice {
  constructor(platform: GoveePlatform, accessory: GoveePlatformAccessoryWithControl) {
    super(platform, accessory, 3, 'Switch');
  }
}

