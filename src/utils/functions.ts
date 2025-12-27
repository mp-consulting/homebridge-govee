import { Buffer } from 'node:buffer';
import fs from 'node:fs';

import NodeRSA from 'node-rsa';
import pem from 'pem';

import type { IotCertificate } from '../types.js';

export function base64ToHex(base64: string): string {
  return Buffer.from(base64, 'base64').toString('hex');
}

export function hexToBase64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

export function cenToFar(temp: number): number {
  return Math.round(((temp * 9) / 5 + 32) * 10) / 10;
}

export function farToCen(temp: number): number {
  return Math.round(((temp - 32) * 5) / 9);
}

export function generateCodeFromHexValues(
  hexValues: (number | number[])[],
  returnAsHexBuffer = false,
): string | Buffer {
  const cmdSection = Buffer.from(hexValues.flat());
  const padSection = Buffer.from(Array.from({ length: 19 - cmdSection.length }).fill(0) as number[]);
  const noXSection = Buffer.concat([cmdSection, padSection]);
  let checksum = 0;
  Object.values(noXSection).forEach((i) => {
    checksum ^= i;
  });
  const chkSection = Buffer.from([checksum]);
  const finalBuffer = Buffer.concat([noXSection, chkSection]);
  return returnAsHexBuffer
    ? finalBuffer
    : finalBuffer.toString('base64');
}

export function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  while (nonce.length < length) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

export function getTwoItemPosition<T>(array: T[], part: number): T {
  return array[part - 1];
}

export function hasProperty(obj: unknown, prop: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

export function hexToDecimal(hex: string): number {
  return Number.parseInt(hex, 16);
}

export function hexToTwoItems(hex: string): string[] {
  return hex.match(/.{1,2}/g) || [];
}

export function nearestHalf(num: number): number {
  return Math.round(num * 2) / 2;
}

export function parseDeviceId(deviceId: string): string {
  return deviceId
    .toString()
    .toUpperCase()
    .replace(/[^A-F0-9_:]+/g, '');
}

export function parseError(err: unknown, hideStack: string[] = []): string {
  if (err instanceof Error) {
    let toReturn = err.message;
    if (err.stack && err.stack.length > 0 && !hideStack.includes(err.message)) {
      const stack = err.stack.split('\n');
      if (stack[1]) {
        toReturn += stack[1].replace('   ', '');
      }
    }
    return toReturn;
  }
  return String(err);
}

export async function pfxToCertAndKey(pfxPath: string, p12Password: string): Promise<IotCertificate> {
  return new Promise((resolve, reject) => {
    pem.readPkcs12(fs.readFileSync(pfxPath), { p12Password }, (err, cert) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const key = new NodeRSA(cert.key);
        resolve({
          cert: cert.cert,
          key: key.exportKey('pkcs8'),
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function statusToActionCode(statusCode: string): string {
  const choppedCode = `33${statusCode.slice(2, -2)}`;
  const choppedArray = hexToTwoItems(choppedCode);
  const hexValues = choppedArray.map(byte => `0x${byte}`);
  const generatedCode = generateCodeFromHexValues(hexValues.map(v => Number.parseInt(v, 16)));
  return Buffer.from(generatedCode as string, 'base64').toString('hex');
}

// Re-export colour functions for convenience
export { hs2rgb, rgb2hs } from './colour.js';
