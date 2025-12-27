#!/usr/bin/env node
/**
 * Script to extract model categories from constants.ts and generate
 * a JavaScript file for the UI. This ensures the model lists stay in sync.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const constantsPath = join(__dirname, '../src/utils/constants.ts');
const outputPath = join(__dirname, '../homebridge-ui/public/models.js');

// Read the constants.ts file
const constantsContent = readFileSync(constantsPath, 'utf8');

// Extract the models object using regex
const modelsMatch = constantsContent.match(/models:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*matterModels/);

if (!modelsMatch) {
  console.error('Could not find models object in constants.ts');
  process.exit(1);
}

const modelsContent = modelsMatch[1];

// Parse each model category
const categories = {};
const categoryRegex = /(\w+):\s*\[([\s\S]*?)\]/g;
let match;

while ((match = categoryRegex.exec(modelsContent)) !== null) {
  const categoryName = match[1];
  const modelsString = match[2];

  // Extract model strings
  const models = [];
  const modelRegex = /'([A-Z0-9]+)'/g;
  let modelMatch;

  while ((modelMatch = modelRegex.exec(modelsString)) !== null) {
    models.push(modelMatch[1]);
  }

  categories[categoryName] = models;
}

// Generate the JavaScript file
const jsContent = `// Auto-generated from src/utils/constants.ts - DO NOT EDIT MANUALLY
// Run 'npm run build' to regenerate this file

const modelCategories = ${JSON.stringify(categories, null, 2)};

// Determine device type from model SKU
function getDeviceTypeFromModel(model) {
  if (!model) return 'lightDevices'; // Default to light

  const sku = model.toUpperCase();

  // Check specific categories first (most specific to least)
  if (modelCategories.switchSingle.includes(sku) ||
      modelCategories.switchDouble.includes(sku) ||
      modelCategories.switchTriple.includes(sku)) {
    return 'switchDevices';
  }
  if (modelCategories.sensorLeak.includes(sku)) return 'leakDevices';
  if (modelCategories.sensorThermo.includes(sku) ||
      modelCategories.sensorThermo4.includes(sku) ||
      modelCategories.sensorMonitor.includes(sku)) {
    return 'thermoDevices';
  }
  if (modelCategories.sensorButton.includes(sku) ||
      modelCategories.sensorContact.includes(sku) ||
      modelCategories.sensorPresence.includes(sku)) {
    return 'thermoDevices'; // Group other sensors with thermo
  }
  if (modelCategories.fan.includes(sku)) return 'fanDevices';
  if (modelCategories.heater1.includes(sku) ||
      modelCategories.heater2.includes(sku)) {
    return 'heaterDevices';
  }
  if (modelCategories.humidifier.includes(sku)) return 'humidifierDevices';
  if (modelCategories.dehumidifier.includes(sku)) return 'dehumidifierDevices';
  if (modelCategories.purifier.includes(sku)) return 'purifierDevices';
  if (modelCategories.diffuser.includes(sku)) return 'diffuserDevices';
  if (modelCategories.iceMaker.includes(sku)) return 'iceMakerDevices';
  if (modelCategories.kettle.includes(sku)) return 'kettleDevices';
  if (modelCategories.rgb.includes(sku)) return 'lightDevices';

  // Default to light for unknown models
  return 'lightDevices';
}
`;

// Ensure output directory exists
const outputDir = dirname(outputPath);
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Write the file
writeFileSync(outputPath, jsContent, 'utf8');

console.log(`Generated ${outputPath}`);
console.log(`Extracted ${Object.keys(categories).length} model categories`);
