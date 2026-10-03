#!/usr/bin/env node
/**
 * Generate homebridge-ui/public/models.js (model lists and the model -> config array mapping)
 * for the browser-side config UI from the compiled plugin, so the UI can never disagree with
 * the plugin. Runs after `tsc` in `npm run build`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import platformConsts from '../dist/utils/constants.js';
import { MODEL_CONFIG_KEYS } from '../dist/utils/device-types.js';

const outputPath = join(dirname(fileURLToPath(import.meta.url)), '../homebridge-ui/public/models.js');

const categories = platformConsts.models;

const jsContent = `// Auto-generated from src/utils/constants.ts and src/utils/device-types.ts - DO NOT EDIT MANUALLY
// Run 'npm run build' to regenerate this file

const modelCategories = ${JSON.stringify(categories, null, 2)};

const modelConfigKeys = ${JSON.stringify(MODEL_CONFIG_KEYS)};

// Determine the config array (device type) for a model SKU; unknown models are lights
function getDeviceTypeFromModel(model) {
  const sku = (model || '').toUpperCase();
  const match = modelConfigKeys.find(([list]) => modelCategories[list].includes(sku));
  return match ? match[1] : 'lightDevices';
}
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, jsContent, 'utf8');

console.log(`Generated ${outputPath}`);
console.log(`Extracted ${Object.keys(categories).length} model categories`);
