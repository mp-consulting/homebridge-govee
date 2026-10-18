#!/usr/bin/env npx tsx
/**
 * Dump full device details from the Govee API and compare with the plugin catalog.
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const raw = JSON.parse(readFileSync(resolve(__dirname, '../test/hbConfig/config.json'), 'utf-8'));
const govee = raw.platforms.find((p: Record<string, unknown>) => p.platform === 'Govee');
const clientId = 'hb' + crypto.createHash('md5').update(govee.username).digest('hex').slice(0, -2);

async function main(): Promise<void> {
  // Login
  const loginRes = await fetch('https://app2.govee.com/account/rest/account/v1/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      appVersion: '6.8.01',
      clientId,
      clientType: '1',
      timestamp: String(Date.now()),
    },
    body: JSON.stringify({ email: govee.username, password: govee.password, client: clientId }),
  });
  const loginData = await loginRes.json() as Record<string, Record<string, string>>;
  const token = loginData.client.token;

  // Get devices
  const devRes = await fetch('https://app2.govee.com/device/rest/devices/v1/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      appVersion: '6.8.01',
      clientId,
      clientType: '1',
      timestamp: String(Date.now()),
    },
  });
  const devData = await devRes.json() as Record<string, unknown>;
  const devices = devData.devices as Array<Record<string, unknown>>;

  // Load catalog to check which models are supported
  const catalogModels: Set<string> = new Set();
  try {
    const catalogPath = resolve(__dirname, '../src/catalog/devices.ts');
    const catalogSrc = readFileSync(catalogPath, 'utf-8');
    // Extract model strings like 'H6001', 'H7060', etc.
    const matches = catalogSrc.matchAll(/'(H[0-9A-Z]{4,5})'/g);
    for (const m of matches) {
      catalogModels.add(m[1]);
    }
  } catch {
    console.warn('Could not load catalog — skipping support check.\n');
  }

  console.log('='.repeat(70));
  console.log(`Found ${devices.length} device(s) from the Govee API`);
  console.log('='.repeat(70));

  for (const d of devices) {
    const sku = String(d.sku || '');
    const inCatalog = catalogModels.has(sku);

    console.log('');
    console.log(`${inCatalog ? '\x1b[32m✓' : '\x1b[33m?'}\x1b[0m ${d.deviceName} (${sku})`);
    console.log(`  Device ID:    ${d.device}`);
    console.log(`  Good Name:    ${d.goodsName ?? d.pactType ?? '-'}`);
    console.log(`  Version Hard: ${d.versionHard ?? '-'}  Soft: ${d.versionSoft ?? '-'}`);
    console.log(`  In catalog:   ${inCatalog ? 'YES' : 'NO — potential new device to add'}`);

    // Print interesting fields
    const skip = new Set(['device', 'deviceName', 'sku', 'goodsName', 'versionHard', 'versionSoft', 'pactType']);
    const extras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) {
      if (!skip.has(k) && v !== undefined && v !== null && v !== '') {
        extras[k] = v;
      }
    }
    if (Object.keys(extras).length > 0) {
      console.log(`  Details:      ${JSON.stringify(extras, null, 2).replace(/\n/g, '\n                ')}`);
    }
  }

  // Summary
  const unsupported = devices.filter((d) => !catalogModels.has(String(d.sku || '')));
  if (unsupported.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log(`\x1b[33m${unsupported.length} device(s) NOT in the plugin catalog:\x1b[0m`);
    for (const d of unsupported) {
      console.log(`  - ${d.sku}: ${d.deviceName} (${d.goodsName ?? '-'})`);
    }
  } else {
    console.log('\n\x1b[32mAll devices are already in the catalog.\x1b[0m');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
