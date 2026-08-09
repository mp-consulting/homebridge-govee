import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normaliseSceneLibrary, type SceneLibrary } from './govee-content.js';

/**
 * Offline fallback for the Govee scene library.
 *
 * The Govee Home app ships a bundled scene catalogue it falls back to when the
 * per-device library cannot be fetched; `src/catalog/scene-library.json` is the same
 * data, trimmed to the fields this plugin uses. It lets the config UI show a scene
 * picker before the user has logged in, and keeps scenes working for BLE-only or
 * LAN-only setups that never talk to the Govee cloud.
 *
 * It is a fallback, not a replacement: it has no per-device filtering beyond the
 * RGB/RGBIC split, and misses scenes Govee has added since. Prefer the cloud library
 * whenever a token is available.
 */

interface RawCatalogue {
  rgb: Parameters<typeof normaliseSceneLibrary>[0];
  rgbic: Parameters<typeof normaliseSceneLibrary>[0];
  rgbicSkus: string[];
}

let cached: RawCatalogue | undefined;

function load(): RawCatalogue | undefined {
  if (cached) {
    return cached;
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const path = join(here, '..', 'catalog', 'scene-library.json');
    cached = JSON.parse(readFileSync(path, 'utf8')) as RawCatalogue;
    return cached;
  } catch {
    return undefined;
  }
}

/**
 * True when the SKU is an addressable (RGBIC) model, and so uses the richer scene set.
 * Derived from the app's `sku_ic.json`, which records an LED-segment count per model.
 */
export function isRgbicSku(sku: string): boolean {
  const catalogue = load();
  return !!catalogue?.rgbicSkus.includes(sku.toUpperCase());
}

/**
 * Build a scene library for a device from the bundled catalogue.
 *
 * Returns `undefined` when the catalogue is unavailable, so callers can report that
 * no scenes could be offered rather than silently showing an empty picker.
 */
export function getOfflineSceneLibrary(sku: string, device: string): SceneLibrary | undefined {
  const catalogue = load();
  if (!catalogue) {
    return undefined;
  }
  const categories = isRgbicSku(sku) ? catalogue.rgbic : catalogue.rgb;
  return normaliseSceneLibrary(categories, sku.toUpperCase(), device, 'offline');
}
