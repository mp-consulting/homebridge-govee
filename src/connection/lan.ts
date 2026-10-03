import dgram from 'node:dgram';

import type {
  DeviceConfigEntry,
  GoveeLogging,
  GoveePlatformAccessoryWithControl,
  GoveePluginConfig,
  LANDevice,
  LANParams,
} from '../types.js';
import { parseError } from '../utils/functions.js';
import platformLang from '../utils/lang-en.js';

const commands = { scan: 'scan', deviceStatus: 'devStatus' } as const;
const multicastIp = '239.255.255.250';
const scanCommandPort = 4001;
const receiverPort = 4002;
const devicePort = 4003;
const getDevicesScanTimeoutMs = 2000;

// LAN discovery is unauthenticated: bound what a host on the network can make us track
const MAX_LAN_DEVICES = 256;
const MAX_LOGGED_MESSAGE_LENGTH = 200;
const DEVICE_ID_PATTERN = /^([0-9A-F]{2}:){5,7}[0-9A-F]{2}$/i;

/**
 * Whether an IPv4 address is private or link-local, i.e. could belong to a device on the local network
 */
export function isLocalIPv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function truncate(text: string): string {
  return text.length > MAX_LOGGED_MESSAGE_LENGTH ? `${text.substring(0, MAX_LOGGED_MESSAGE_LENGTH)}...` : text;
}

interface LANPlatformRef {
  log: GoveeLogging;
  config: GoveePluginConfig;
  deviceConf: Record<string, Partial<DeviceConfigEntry>>;
  receiveUpdateLAN(deviceId: string, data: Record<string, unknown>, ip: string): void;
}

interface LANMessage {
  msg: {
    cmd: string;
    data: {
      device?: string;
      ip?: string;
      [key: string]: unknown;
    };
  };
}

export default class LANClient {
  private log: GoveeLogging;
  private platform: LANPlatformRef;
  private config: GoveePluginConfig;
  public lanDevices: LANDevice[] = [];
  private receiver: dgram.Socket;
  private sender: dgram.Socket;
  private latestDeviceScanTimestamp: number;
  private connectionPromise: Promise<void>;
  private devicesPolling?: ReturnType<typeof setInterval>;
  private statusPolling?: ReturnType<typeof setInterval>;

  constructor(platform: LANPlatformRef) {
    this.log = platform.log;
    this.config = platform.config;
    this.platform = platform;

    Object.keys(platform.deviceConf).forEach((device) => {
      const conf = platform.deviceConf[device] as { customIPAddress?: string };
      if (conf.customIPAddress) {
        this.lanDevices.push({
          ip: conf.customIPAddress,
          device,
          isPendingDiscovery: true,
          isManual: true,
        });
      }
    });

    this.receiver = dgram.createSocket('udp4');
    this.sender = dgram.createSocket('udp4');
    this.latestDeviceScanTimestamp = Date.now();

    this.connectionPromise = new Promise((resolve, reject) => {
      this.receiver.on('message', (msg, rinfo) => this.handleMessage(msg, rinfo));

      this.receiver.on('error', (err) => {
        this.log.warn('[LAN] server error: %s.', parseError(err));
        reject(err);
      });

      this.receiver.on('listening', () => {
        const { address, port } = this.receiver.address();
        this.log.debug('[LAN] %s %s:%s.', platformLang.lanServerStarted, address, port);
        resolve();
      });

      this.receiver.bind(receiverPort, () => {
        this.receiver.addMembership(multicastIp, '0.0.0.0');
      });

      this.sender.bind();
    });

    // Without a listener, a send failure (e.g. network unreachable after a Wi-Fi drop) would be
    // emitted as an unhandled 'error' event and crash Homebridge
    this.sender.on('error', (err) => {
      this.log.debugWarn('[LAN] sender error: %s.', parseError(err));
    });
  }

  handleMessage(msg: Buffer, rinfo: Pick<dgram.RemoteInfo, 'address'>): void {
    const strMessage = msg.toString();
    let message: LANMessage;
    try {
      message = JSON.parse(strMessage);
    } catch (err) {
      this.log.debug('[LAN] %s [%s] [%s].', platformLang.lanParseError, truncate(strMessage), parseError(err as Error));
      return;
    }
    if (typeof message?.msg?.cmd !== 'string' || typeof message.msg.data !== 'object' || message.msg.data === null) {
      this.log.debug('[LAN] Ignoring malformed message: %s', truncate(strMessage));
      return;
    }

    switch (message.msg.cmd) {
      case commands.scan:
        this.handleScanReply(message.msg.data, rinfo.address, strMessage);
        break;
      case commands.deviceStatus: {
        const foundDevice = this.lanDevices.find(value => value.ip === rinfo.address);
        if (foundDevice) {
          this.platform.receiveUpdateLAN(foundDevice.device, message.msg.data, rinfo.address);
        } else {
          this.log.debug('[LAN] %s [%s].', platformLang.lanUnkDevice, rinfo.address);
        }
        break;
      }
      default:
        break;
    }
  }

  private handleScanReply(deviceData: LANMessage['msg']['data'], address: string, strMessage: string): void {
    this.latestDeviceScanTimestamp = Date.now();

    // Commands are sent to, and status replies matched by, the packet's real source address,
    // never the address a packet claims for itself
    const deviceId = deviceData.device;
    if (typeof deviceId !== 'string' || !DEVICE_ID_PATTERN.test(deviceId)) {
      this.log.debug('[LAN] Ignoring scan reply with invalid device id: %s', truncate(strMessage));
      return;
    }
    const sku = typeof deviceData.sku === 'string' ? deviceData.sku : undefined;
    const existingIndex = this.lanDevices.findIndex(value => value.device === deviceId);
    const existing = this.lanDevices[existingIndex];

    if (existingIndex === -1) {
      if (!isLocalIPv4(address) || this.lanDevices.length >= MAX_LAN_DEVICES) {
        this.log.debug('[LAN] Ignoring scan reply from %s: %s', address, truncate(strMessage));
        return;
      }
      this.log.debug('[LAN] %s [isNew=true,isManual=false] [%s] [%s].', platformLang.lanFoundDevice, truncate(strMessage), address);
      this.lanDevices.push({ device: deviceId, ip: address, sku });
      this.platform.receiveUpdateLAN(deviceId, {}, address);
    } else if (existing.isPendingDiscovery) {
      // A configured device: keep the user's IP address and just record that it answered
      this.lanDevices[existingIndex] = { device: deviceId, ip: existing.ip, sku, isManual: true };
      this.log.debug('[LAN] %s [isNew=true,isManual=true] [%s] [%s].', platformLang.lanFoundDevice, truncate(strMessage), address);
      this.platform.receiveUpdateLAN(deviceId, {}, existing.ip);
    } else if (!existing.isManual && existing.ip !== address && isLocalIPv4(address)) {
      // A discovered device that moved (e.g. a new DHCP lease)
      this.log.debug('[LAN] %s [%s -> %s].', platformLang.lanFoundDevice, existing.ip, address);
      this.lanDevices[existingIndex] = { ...existing, ip: address, sku: sku ?? existing.sku };
      this.platform.receiveUpdateLAN(deviceId, {}, address);
    } else {
      this.log.debug('[LAN] %s [isNew=false] [%s] [%s].', platformLang.lanFoundDevice, truncate(strMessage), address);
    }
  }

  sendScanCommand(): void {
    const scanCommand = JSON.stringify({
      msg: { cmd: commands.scan, data: { account_topic: 'reserve' } },
    });
    this.log.debug('[LAN] scanning for devices over LAN...');
    this.sender.send(scanCommand, scanCommandPort, multicastIp, (err) => {
      if (err) {
        this.log.debugWarn('[LAN] scan request failed: %s.', parseError(err));
      }
    });
  }

  async getDevices(): Promise<LANDevice[]> {
    return new Promise((resolve) => {
      this.connectionPromise.then(
        () => {
          this.sendScanCommand();

          const checkPeriod = setInterval(() => {
            const diff = Date.now() - this.latestDeviceScanTimestamp;
            if (diff >= getDevicesScanTimeoutMs) {
              clearInterval(checkPeriod);
              resolve(this.lanDevices);
            }
          }, 100);
        },
        () => {
          resolve([]);
        },
      );
    });
  }

  async sendDeviceStateRequest(device: LANDevice): Promise<void> {
    const stateCommand = JSON.stringify({ msg: { cmd: commands.deviceStatus, data: {} } });
    return new Promise((resolve, reject) => {
      this.sender.send(stateCommand, devicePort, device.ip, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async updateDevice(accessory: GoveePlatformAccessoryWithControl, params: LANParams): Promise<void> {
    const updatedParams = { msg: params };

    accessory.logDebug(`[LAN] ${platformLang.sendingUpdate} [${JSON.stringify(updatedParams)}]`);

    const foundDeviceId = this.lanDevices.findIndex(
      value => value.device === accessory.context.gvDeviceId,
    );

    if (foundDeviceId === -1) {
      throw new Error(platformLang.lanDevNotFound);
    }

    const foundDevice = this.lanDevices[foundDeviceId];

    return new Promise((resolve, reject) => {
      const command = JSON.stringify(updatedParams);

      this.sender.send(command, devicePort, foundDevice.ip, async (err) => {
        if (err) {
          if (!foundDevice.isManual) {
            // Re-find the device index since the array may have changed
            const currentIndex = this.lanDevices.findIndex(
              value => value.device === accessory.context.gvDeviceId,
            );
            if (currentIndex !== -1) {
              this.lanDevices.splice(currentIndex, 1);
            }
            accessory.logDebugWarn(`[LAN] ${platformLang.lanDevRemoved}`);
          }
          reject(err);
        } else {
          accessory.logDebug(`[LAN] ${platformLang.lanCmdSent} ${foundDevice.ip}`);
          resolve();
        }
      });
    });
  }

  startDevicesPolling(): void {
    this.devicesPolling = setInterval(() => {
      this.sendScanCommand();
    }, (this.config.lanScanInterval || 60) * 1000);
  }

  startStatusPolling(): void {
    this.statusPolling = setInterval(async () => {
      for (const device of this.lanDevices) {
        try {
          await this.sendDeviceStateRequest(device);
        } catch (err) {
          this.log.warn('[%s] [LAN] %s %s.', device.device, platformLang.lanReqError, parseError(err as Error));
        }
      }
    }, (this.config.lanRefreshTime || 30) * 1000);
  }

  close(): void {
    if (this.devicesPolling) {
      clearInterval(this.devicesPolling);
    }
    if (this.statusPolling) {
      clearInterval(this.statusPolling);
    }
    this.receiver.close();
    this.sender.close();
  }
}
