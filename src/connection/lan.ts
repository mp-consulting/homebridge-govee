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
      this.receiver.on('message', (msg, rinfo) => {
        const strMessage = msg.toString();
        try {
          const message: LANMessage = JSON.parse(strMessage);
          if (!message?.msg?.cmd) {
            this.log.debug('[LAN] Ignoring malformed message (missing msg.cmd): %s', strMessage);
            return;
          }
          const command = message.msg.cmd;

          switch (command) {
          case commands.scan: {
            this.latestDeviceScanTimestamp = Date.now();
            const deviceData = message.msg.data;

            if (!deviceData.device) {
              return;
            }

            const existingIndex = this.lanDevices.findIndex(
              value => value.device === deviceData.device,
            );

            if (existingIndex === -1) {
              this.log.debug(
                '[LAN] %s [isNew=true,isManual=false] [%s] [%s].',
                platformLang.lanFoundDevice,
                strMessage,
                JSON.stringify(rinfo),
              );
              this.lanDevices.push({
                device: deviceData.device,
                ip: deviceData.ip || rinfo.address,
                sku: deviceData.sku as string | undefined,
              });

              platform.receiveUpdateLAN(deviceData.device, {}, deviceData.ip || rinfo.address);
            } else if (this.lanDevices[existingIndex].isPendingDiscovery) {
              this.lanDevices[existingIndex] = {
                device: deviceData.device,
                ip: deviceData.ip || rinfo.address,
                sku: deviceData.sku as string | undefined,
                isManual: true,
              };
              this.log.debug(
                '[LAN] %s [isNew=true,isManual=true] [%s] [%s].',
                platformLang.lanFoundDevice,
                strMessage,
                JSON.stringify(rinfo),
              );
              platform.receiveUpdateLAN(deviceData.device, {}, deviceData.ip || rinfo.address);
            } else {
              this.log.debug(
                '[LAN] %s [isNew=false] [%s] [%s].',
                platformLang.lanFoundDevice,
                strMessage,
                JSON.stringify(rinfo),
              );
            }
            break;
          }
          case commands.deviceStatus: {
            const deviceAddress = rinfo.address;
            const foundDeviceId = this.lanDevices.find(value => value.ip === deviceAddress);

            if (foundDeviceId) {
              platform.receiveUpdateLAN(foundDeviceId.device, message.msg.data, deviceAddress);
            } else {
              this.log.warn('[LAN] %s [%s].', platformLang.lanUnkDevice, deviceAddress);
            }
            break;
          }
          default:
            break;
          }
        } catch (err) {
          this.log('[LAN] %s [%s] [%s].', platformLang.lanParseError, strMessage, parseError(err as Error));
        }
      });

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
  }

  sendScanCommand(): void {
    const scanCommand = JSON.stringify({
      msg: { cmd: commands.scan, data: { account_topic: 'reserve' } },
    });
    this.log.debug('[LAN] scanning for devices over LAN...');
    this.sender.send(scanCommand, scanCommandPort, multicastIp);
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
