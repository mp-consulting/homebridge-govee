import { Buffer } from 'node:buffer';
import { promises } from 'node:fs';

import type { GoveeLogging } from '../types.js';
import { parseError } from '../utils/functions.js';
import platformLang from '../utils/lang-en.js';

// Storage key for cached account credentials:
// topic ::: token ::: username ::: accountId ::: endpoint ::: p12 password ::: (legacy, unused)
const CREDENTIALS_KEY = 'Govee_All_Devices_temp';

/** What a Govee login yields and what is needed to talk to the HTTP and AWS IoT APIs */
export interface AccountCredentials {
  topic: string;
  token: string;
  accountId: string;
  endpoint: string;
  iotPass: string;
}

interface KeyValueStore {
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}

/**
 * Persists the account token and AWS IoT certificate between restarts. Both are credentials,
 * so the certificate file is written readable by the Homebridge user only.
 */
export class CredentialStore {
  constructor(
    private readonly storage: KeyValueStore | undefined,
    private readonly username: string,
    /** Path of the AWS IoT client certificate (PKCS#12) */
    readonly iotFile: string,
    private readonly log: GoveeLogging,
  ) {}

  /**
   * The credentials saved by a previous login for the same user, or undefined when a fresh
   * login is needed (nothing cached, different user, or the certificate file is missing)
   */
  async load(): Promise<AccountCredentials | undefined> {
    try {
      this.log.debug('[HTTP] Checking for cached credentials...');
      const stored = await this.storage?.getItem(CREDENTIALS_KEY);
      const parts = typeof stored === 'string' ? stored.split(':::') : undefined;
      if (!parts || parts.length !== 7) {
        throw new Error(platformLang.accTokenNoExist);
      }
      const [topic, token, username, accountId, endpoint, iotPass] = parts;
      if (username !== this.username) {
        throw new Error(platformLang.accTokenUserChange);
      }
      await promises.access(this.iotFile);
      this.log.debug('[HTTP] %s.', platformLang.accTokenFromCache);
      return { topic, token, accountId, endpoint, iotPass };
    } catch (err) {
      this.log.debug('[HTTP] Cache not available (%s), performing fresh login...', parseError(err));
      return undefined;
    }
  }

  /**
   * Save credentials and the base64-encoded IoT certificate from a fresh login
   */
  async save(credentials: AccountCredentials, iotCertificate: string): Promise<void> {
    await promises.writeFile(this.iotFile, Buffer.from(iotCertificate, 'base64'), { mode: 0o600 });
    // writeFile only applies the mode when it creates the file
    await promises.chmod(this.iotFile, 0o600);
    try {
      const { topic, token, accountId, endpoint, iotPass } = credentials;
      await this.storage?.setItem(CREDENTIALS_KEY, `${topic}:::${token}:::${this.username}:::${accountId}:::${endpoint}:::${iotPass}:::`);
    } catch (err) {
      this.log.warn('[HTTP] %s %s.', platformLang.accTokenStoreErr, parseError(err));
    }
  }

  async clear(): Promise<void> {
    try {
      await this.storage?.removeItem(CREDENTIALS_KEY);
    } catch (err) {
      this.log.debugWarn('[HTTP] Could not clear cached credentials: %s', parseError(err));
    }
  }
}
