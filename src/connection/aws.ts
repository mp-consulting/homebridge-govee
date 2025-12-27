import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import url from 'node:url';

import { device as IotDeviceClass } from 'aws-iot-device-sdk';

import type {
  AWSMessage,
  AWSParams,
  GoveeLogging,
  GoveePlatformAccessoryWithControl,
  IotCertificate,
} from '../types.js';
import { parseError } from '../utils/functions.js';
import platformLang from '../utils/lang-en.js';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));

interface AWSPlatformRef {
  accountTopic: string;
  accountId: string;
  clientId: string;
  iotEndpoint: string;
  log: GoveeLogging;
  receiveUpdateAWS(payload: AWSMessage): void;
}

export default class AWSClient {
  private accountTopic: string;
  private device: InstanceType<typeof IotDeviceClass>;
  public connected = false;

  constructor(platform: AWSPlatformRef, iotFile: IotCertificate) {
    this.accountTopic = platform.accountTopic;

    this.device = new IotDeviceClass({
      privateKey: Buffer.from(iotFile.key, 'utf8'),
      clientCert: Buffer.from(iotFile.cert, 'utf8'),
      caCert: readFileSync(resolve(dirname, './cert/AmazonRootCA1.pem')),
      clientId: `AP/${platform.accountId}/${platform.clientId}`,
      host: platform.iotEndpoint,
    });

    this.device.on('close', () => {
      platform.log.debugWarn('[AWS] %s.', platformLang.awsEventClose);
      this.connected = false;
    });

    this.device.on('reconnect', () => {
      platform.log.debug('[AWS] %s.', platformLang.awsEventReconnect);
      this.connected = true;
    });

    this.device.on('offline', () => {
      platform.log.debugWarn('[AWS] %s.', platformLang.awsEventOffline);
      this.connected = false;
    });

    this.device.on('error', (error: string | Error) => {
      const errorMsg = typeof error === 'string' ? error : parseError(error);
      platform.log.debugWarn('[AWS] %s [%s].', platformLang.awsEventError, errorMsg);
      this.connected = false;
    });

    this.device.on('message', (_topic: string, payload: Buffer) => {
      const payloadString = Buffer.from(payload).toString();

      try {
        let parsedPayload: AWSMessage = JSON.parse(payloadString);

        if (parsedPayload.msg && typeof parsedPayload.msg === 'string') {
          try {
            parsedPayload = JSON.parse(parsedPayload.msg);
          } catch {
            platform.log.debugWarn('[AWS] %s [%s].', platformLang.invalidJson, payloadString);
            return;
          }
        }

        if (parsedPayload.data && typeof parsedPayload.data === 'string') {
          try {
            parsedPayload.data = JSON.parse(parsedPayload.data);
          } catch {
            // Do nothing, leave as string
          }
        }

        platform.log.debug('[AWS] %s [%s].', platformLang.awsEventMessage, payloadString);
        platform.receiveUpdateAWS(parsedPayload);
      } catch {
        platform.log.debugWarn('[AWS] %s [%s].', platformLang.invalidJson, payloadString);
      }
    });

    this.device.on('connect', () => {
      platform.log.debug('[AWS] %s.', platformLang.awsEventConnect);
      this.connected = true;
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.device.subscribe(this.accountTopic, { qos: 0 }, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async requestUpdate(accessory: GoveePlatformAccessoryWithControl): Promise<void> {
    if (!this.connected) {
      throw new Error(platformLang.notAWSConn);
    }

    const payload = {
      msg: {
        cmd: 'status',
        cmdVersion: 2,
        transaction: `v_${Date.now()}000`,
        type: 0,
        accountTopic: '',
      },
    };

    accessory.logDebug(`[AWS] ${platformLang.sendingUpdate} ${JSON.stringify(payload)}`);

    payload.msg.accountTopic = this.accountTopic;

    return new Promise((resolve, reject) => {
      this.device.publish(
        accessory.context.awsTopic!,
        JSON.stringify(payload),
        {},
        (err?: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  async updateDevice(accessory: GoveePlatformAccessoryWithControl, params: AWSParams): Promise<void> {
    if (!this.connected) {
      throw new Error(platformLang.notAWSConn);
    }

    const payload = {
      msg: {
        cmd: params.cmd,
        cmdVersion: 0,
        data: params.data,
        transaction: `v_${Date.now()}000`,
        type: 1,
        accountTopic: '',
      },
    };

    accessory.logDebug(`[AWS] ${platformLang.sendingUpdate} ${JSON.stringify(payload)}`);

    payload.msg.accountTopic = this.accountTopic;

    return new Promise((resolve, reject) => {
      this.device.publish(
        accessory.context.awsTopic!,
        JSON.stringify(payload),
        {},
        (err?: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }
}
