#!/usr/bin/env npx tsx
/**
 * Test script to verify Govee API endpoints.
 *
 * Compares the old (app2.govee.com) and new (device.govee.com) API endpoints
 * to determine which ones are still functional with the current credentials.
 *
 * Usage:
 *   npx tsx scripts/test-govee-api.ts
 *
 * Reads credentials from test/hbConfig/config.json automatically.
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface GoveeConfig {
  username: string;
  password: string;
}

function loadConfig(): GoveeConfig {
  const configPath = resolve(__dirname, '../test/hbConfig/config.json');
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  const govee = raw.platforms?.find((p: Record<string, unknown>) => p.platform === 'Govee');
  if (!govee?.username || !govee?.password) {
    throw new Error('Could not find Govee platform credentials in config.json');
  }
  return { username: govee.username, password: govee.password };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateClientId(username: string): string {
  const hash = crypto.createHash('md5').update(username).digest('hex');
  return `hb${hash.substring(0, hash.length - 2)}`;
}

// Simple fetch wrapper with timeout
async function request(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string | number>;
    body?: unknown;
    timeout?: number;
  } = {},
): Promise<{ status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? 15000);

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(
          Object.entries(opts.headers ?? {}).map(([k, v]) => [k, String(v)]),
        ),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// API definitions
// ---------------------------------------------------------------------------

const OLD_APP_VERSION = '6.8.01';
const OLD_USER_AGENT = `GoveeHome/${OLD_APP_VERSION} (com.ihoment.GoVeeSensor; build:2; iOS 18.3.0) Alamofire/5.10.2`;

const NEW_APP_VERSION = '7.4.10';
const NEW_USER_AGENT = `GoveeHome/${NEW_APP_VERSION} (com.ihoment.GoVeeSensor; build:2; Android 14) okhttp/4.12.0`;

interface Endpoint {
  label: string;
  url: string;
  appVersion: string;
  userAgent: string;
  clientType: number;
}

const LOGIN_ENDPOINTS: Endpoint[] = [
  {
    label: 'OLD login (app2.govee.com v1)',
    url: 'https://app2.govee.com/account/rest/account/v1/login',
    appVersion: OLD_APP_VERSION,
    userAgent: OLD_USER_AGENT,
    clientType: 1,
  },
  {
    label: 'NEW login v1 (app.govee.com)',
    url: 'https://app.govee.com/account/rest/account/v1/login',
    appVersion: NEW_APP_VERSION,
    userAgent: NEW_USER_AGENT,
    clientType: 0,
  },
  {
    label: 'NEW login v2 (app.govee.com)',
    url: 'https://app.govee.com/account/rest/account/v2/login',
    appVersion: NEW_APP_VERSION,
    userAgent: NEW_USER_AGENT,
    clientType: 0,
  },
];

const DEVICE_LIST_ENDPOINTS: Endpoint[] = [
  {
    label: 'OLD device list (app2.govee.com)',
    url: 'https://app2.govee.com/device/rest/devices/v1/list',
    appVersion: OLD_APP_VERSION,
    userAgent: OLD_USER_AGENT,
    clientType: 1,
  },
  {
    label: 'NEW device list (device.govee.com /bff-app)',
    url: 'https://device.govee.com/bff-app/v1/device/list',
    appVersion: NEW_APP_VERSION,
    userAgent: NEW_USER_AGENT,
    clientType: 0,
  },
  {
    label: 'OLD domain + NEW path (/bff-app)',
    url: 'https://app2.govee.com/bff-app/v1/device/list',
    appVersion: OLD_APP_VERSION,
    userAgent: OLD_USER_AGENT,
    clientType: 1,
  },
];

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

function buildHeaders(
  endpoint: Endpoint,
  clientId: string,
  token?: string,
): Record<string, string | number> {
  const h: Record<string, string | number> = {
    appVersion: endpoint.appVersion,
    clientId,
    clientType: endpoint.clientType,
    timestamp: Date.now(),
    'User-Agent': endpoint.userAgent,
  };
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

async function testLogin(
  endpoint: Endpoint,
  username: string,
  password: string,
  clientId: string,
): Promise<{ token?: string; accountId?: string; raw: unknown }> {
  const headers = buildHeaders(endpoint, clientId);
  const body = { email: username, password, client: clientId };
  const { status, data } = await request(endpoint.url, { headers, body });
  const d = data as Record<string, unknown> | null;
  const client = d?.client as Record<string, string> | undefined;
  return {
    token: client?.token,
    accountId: client?.accountId,
    raw: { status, ...(typeof d === 'object' && d !== null ? { message: d.message, status: d.status, hasClient: !!d.client, deviceCount: Array.isArray((d as Record<string, unknown>).devices) ? (d.devices as unknown[]).length : undefined } : { data: d }) },
  };
}

async function testDeviceList(
  endpoint: Endpoint,
  token: string,
  clientId: string,
): Promise<{ deviceCount?: number; deviceNames?: string[]; raw: unknown }> {
  const headers = buildHeaders(endpoint, clientId, token);
  const { status, data } = await request(endpoint.url, { headers });
  const d = data as Record<string, unknown> | null;
  const devices = (d?.devices ?? (d?.data as Record<string, unknown>)?.devices) as Array<Record<string, string>> | undefined;
  return {
    deviceCount: devices?.length,
    deviceNames: devices?.map((dev) => `${dev.deviceName || dev.sku || 'unknown'} (${dev.device || '?'})`),
    raw: { status, message: d?.message, hasDevices: !!devices, deviceCount: devices?.length, responseKeys: d ? Object.keys(d) : [] },
  };
}

function logResult(label: string, success: boolean, details: unknown): void {
  const icon = success ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`\n${icon} ${label}`);
  console.log('  ', JSON.stringify(details, null, 2).replace(/\n/g, '\n  '));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = loadConfig();
  const clientId = generateClientId(config.username);

  console.log('='.repeat(70));
  console.log('Govee API Endpoint Test');
  console.log('='.repeat(70));
  console.log(`Username:  ${config.username}`);
  console.log(`Client ID: ${clientId}`);
  console.log('');

  // --- Login tests ---
  console.log('-'.repeat(70));
  console.log('LOGIN ENDPOINTS');
  console.log('-'.repeat(70));

  const tokens: Map<string, string> = new Map();

  for (const ep of LOGIN_ENDPOINTS) {
    try {
      const result = await testLogin(ep, config.username, config.password, clientId);
      const ok = !!result.token;
      logResult(ep.label, ok, result.raw);
      if (result.token) {
        tokens.set(ep.label, result.token);
      }
    } catch (err) {
      logResult(ep.label, false, { error: (err as Error).message });
    }
  }

  // --- Device list tests ---
  console.log('\n' + '-'.repeat(70));
  console.log('DEVICE LIST ENDPOINTS');
  console.log('-'.repeat(70));

  // Use each token we got to test each device list endpoint
  for (const [loginLabel, token] of tokens) {
    console.log(`\n  Using token from: ${loginLabel}`);
    console.log(`  Token (first 20): ${token.substring(0, 20)}...`);

    for (const ep of DEVICE_LIST_ENDPOINTS) {
      try {
        const result = await testDeviceList(ep, token, clientId);
        const ok = (result.deviceCount ?? 0) > 0;
        logResult(ep.label, ok, result.raw);
        if (result.deviceNames?.length) {
          console.log('   Devices:');
          for (const name of result.deviceNames) {
            console.log(`     - ${name}`);
          }
        }
      } catch (err) {
        logResult(ep.label, false, { error: (err as Error).message });
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
