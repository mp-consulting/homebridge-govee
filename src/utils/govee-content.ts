import axios from 'axios';

import { goveeHeaders } from './govee-api.js';
import { encodeDiy, encodeScene, framesToCode } from './scene-codes.js';

/**
 * Access to the Govee app's *content* APIs — the per-device scene library, the user's
 * DIY effects, saved snapshots, and the capability list that tells us which modes a
 * device actually has.
 *
 * These sit alongside `govee-api.ts` (account and device endpoints) and reuse the same
 * bearer token and client id. They are consumed both by the plugin at runtime and by
 * the custom config UI server, so they are plain functions rather than a class.
 *
 * These are the unofficial endpoints the Govee Home app itself calls. They can change
 * without notice, so every caller must be able to carry on without them.
 */

export const GOVEE_CONTENT_URLS = {
  /** Per-device scene library, including icon URLs and effect payloads. */
  scenes: 'https://app2.govee.com/appsku/v2/scences',
  /** The account's saved scenes for a device. */
  ownScenes: 'https://app2.govee.com/appsku/v1/scences',
  /** The account's DIY effects, grouped. */
  diys: 'https://app2.govee.com/bff-app/v1/diy/list',
  /** Saved snapshots for a device. */
  snapshots: 'https://app2.govee.com/bff-app/v1/devices/snapshots',
  /** Which modes/functions a device supports. */
  functionSupport: 'https://app2.govee.com/bff-app/v1/devices/detail/function-support',
} as const;

const REQUEST_TIMEOUT = 20000;

export interface GoveeDeviceRef {
  sku: string;
  device: string;
  goodsType?: number;
  versionSoft?: string;
  versionHard?: string;
  wifiVersionSoft?: string;
  wifiVersionHard?: string;
  pactType?: number;
  pactCode?: number;
}

// ============================================================================
// Raw response shapes (only the fields we consume)
// ============================================================================

interface RawSpecialEffect {
  scenceParamId?: number;
  scenceParam?: string;
  sceneCode?: number;
  sceneType?: number;
  supportSku?: string[];
}

interface RawLightEffect {
  scenceParamId?: number;
  scenceName?: string;
  scenceParam?: string;
  sceneCode?: number;
  sceneType?: number;
  specialEffect?: RawSpecialEffect[];
  speedInfo?: { supSpeed?: boolean };
  supportDirections?: number[];
}

interface RawScene {
  sceneId?: number;
  sceneName?: string;
  analyticName?: string;
  sceneNameNew?: Record<string, string>;
  iconUrls?: string[];
  sceneCode?: number;
  sceneType?: number;
  lightEffects?: RawLightEffect[];
}

interface RawCategory {
  categoryId?: number;
  categoryName?: string;
  scenes?: RawScene[];
}

// ============================================================================
// Normalised shapes shared with the config UI
// ============================================================================

/**
 * One selectable effect within a scene. Most scenes have a single variant; where a
 * scene ships several, they are the speed/style alternatives the Govee app offers.
 */
export interface SceneVariant {
  /** `scenceParamId` — stable identity for the variant. */
  id: number;
  name: string;
  /** Comma-separated base64 frames, ready for the `rgbScene` command. */
  code: string;
  supportsSpeed: boolean;
  supportedDirections: number[];
}

export interface SceneEntry {
  sceneId: number;
  name: string;
  category: string;
  /** Icon shown in the config UI; light and dark variants when Govee provides both. */
  iconUrl?: string;
  iconUrlDark?: string;
  variants: SceneVariant[];
  /** Convenience: the code of the first variant. */
  code: string;
}

export interface SceneCategory {
  id: number;
  name: string;
  scenes: SceneEntry[];
}

export interface SceneLibrary {
  sku: string;
  device: string;
  categories: SceneCategory[];
  /** Where the data came from, so the UI can say so. */
  source: 'cloud' | 'offline';
}

export interface DiyEntry {
  diyId: number;
  name: string;
  group?: string;
  iconUrl?: string;
  code: string;
}

export interface SnapshotEntry {
  snapshotId: number;
  name: string;
  iconUrl?: string;
}

/** Modes the Govee app can show for a device, keyed by its internal mode id. */
export const GOVEE_MODES: Record<number, string> = {
  7: 'video',
  8: 'music',
  9: 'colour',
  10: 'scene',
  11: 'diy',
  12: 'graffiti',
  13: 'illumination',
  18: 'interaction',
  19: 'quickOperation',
  20: 'shareSpace',
  21: 'display',
  22: 'carousel',
};

export interface FunctionSupport {
  /** Mode names the device supports, e.g. `['scene', 'music', 'diy']`. */
  modes: string[];
  /** Raw ids, for diagnostics and forward compatibility. */
  modeIds: number[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Govee wants the bare device id with no separators on some endpoints and the
 * colon-separated form on others; the scene endpoints use whatever the device list
 * returned, which is the colon form.
 */
function sceneName(scene: RawScene): string {
  const localised = scene.sceneNameNew?.en;
  return localised || scene.sceneName || scene.analyticName || `Scene ${scene.sceneId ?? ''}`.trim();
}

/**
 * Pick the effect payload for a specific SKU. Govee ships per-model overrides in
 * `specialEffect`, which take priority over the generic payload when they list our SKU.
 */
function resolveEffect(effect: RawLightEffect, sku: string): RawLightEffect {
  const override = effect.specialEffect?.find((special) => special.supportSku?.includes(sku));
  if (!override) {
    return effect;
  }
  return {
    ...effect,
    scenceParamId: override.scenceParamId ?? effect.scenceParamId,
    scenceParam: override.scenceParam || effect.scenceParam,
    sceneCode: override.sceneCode && override.sceneCode > 0 ? override.sceneCode : effect.sceneCode,
    sceneType: override.sceneType ?? effect.sceneType,
  };
}

function toVariant(effect: RawLightEffect, scene: RawScene, sku: string, index: number): SceneVariant | undefined {
  const resolved = resolveEffect(effect, sku);
  const sceneCode = resolved.sceneCode ?? scene.sceneCode;
  if (sceneCode === undefined) {
    return undefined;
  }

  const frames = encodeScene({
    scenceParam: resolved.scenceParam ?? '',
    sceneCode,
    sceneType: resolved.sceneType ?? scene.sceneType,
  });

  return {
    id: resolved.scenceParamId ?? index,
    name: resolved.scenceName || `Variant ${index + 1}`,
    code: framesToCode(frames),
    supportsSpeed: !!effect.speedInfo?.supSpeed,
    supportedDirections: effect.supportDirections ?? [],
  };
}

/**
 * Convert a raw scene-library response into the normalised, already-encoded form the
 * config UI and the device handler both consume.
 */
export function normaliseSceneLibrary(
  categories: RawCategory[],
  sku: string,
  device: string,
  source: SceneLibrary['source'] = 'cloud',
): SceneLibrary {
  const normalised: SceneCategory[] = [];

  for (const category of categories ?? []) {
    const scenes: SceneEntry[] = [];

    for (const scene of category.scenes ?? []) {
      const effects = scene.lightEffects?.length ? scene.lightEffects : [{}];
      const variants = effects
        .map((effect, index) => toVariant(effect, scene, sku, index))
        .filter((variant): variant is SceneVariant => variant !== undefined);

      if (variants.length === 0) {
        continue;
      }

      const [light, , dark] = scene.iconUrls ?? [];
      scenes.push({
        sceneId: scene.sceneId ?? 0,
        name: sceneName(scene),
        category: category.categoryName ?? '',
        iconUrl: light,
        iconUrlDark: dark,
        variants,
        code: variants[0].code,
      });
    }

    if (scenes.length > 0) {
      normalised.push({
        id: category.categoryId ?? 0,
        name: category.categoryName ?? 'Scenes',
        scenes,
      });
    }
  }

  return { sku, device, categories: normalised, source };
}

// ============================================================================
// Endpoints
// ============================================================================

/**
 * Fetch the scene library Govee offers for one device.
 *
 * Throws if the request fails — callers decide whether to fall back to the bundled
 * offline catalogue.
 */
export async function goveeGetSceneLibrary(
  token: string,
  clientId: string,
  ref: GoveeDeviceRef,
): Promise<SceneLibrary> {
  const res = await axios({
    url: GOVEE_CONTENT_URLS.scenes,
    method: 'get',
    headers: goveeHeaders(token, clientId),
    params: {
      sku: ref.sku,
      device: ref.device,
      goodsType: ref.goodsType ?? 0,
      source: 0,
    },
    timeout: REQUEST_TIMEOUT,
  });

  const categories = res.data?.data?.categories;
  if (!Array.isArray(categories)) {
    throw new Error('Govee scene library response did not contain any categories');
  }

  return normaliseSceneLibrary(categories, ref.sku, ref.device);
}

/**
 * Fetch the account's DIY effects that apply to a device.
 */
export async function goveeGetDiyEffects(
  token: string,
  clientId: string,
  ref: GoveeDeviceRef,
): Promise<DiyEntry[]> {
  const res = await axios({
    url: GOVEE_CONTENT_URLS.diys,
    method: 'post',
    headers: goveeHeaders(token, clientId),
    data: {
      sku: ref.sku,
      device: ref.device,
      goodsType: ref.goodsType ?? 0,
    },
    timeout: REQUEST_TIMEOUT,
  });

  const groups = res.data?.data?.diys;
  if (!Array.isArray(groups)) {
    return [];
  }

  const entries: DiyEntry[] = [];
  for (const group of groups) {
    for (const diy of group?.diys ?? []) {
      const diyCode = diy?.diyCode ?? diy?.diyId;
      if (diyCode === undefined || diyCode === null) {
        continue;
      }
      entries.push({
        diyId: diy.diyId ?? diyCode,
        name: diy.diyName || diy.name || `DIY ${diyCode}`,
        group: group.groupName || undefined,
        iconUrl: diy.coverUrl || undefined,
        code: framesToCode(encodeDiy(diy.effectStr ?? '', diyCode)),
      });
    }
  }

  return entries;
}

/**
 * Fetch a device's saved snapshots. Snapshots are applied through the Govee cloud
 * rather than by a byte payload, so only their identity is returned.
 */
export async function goveeGetSnapshots(
  token: string,
  clientId: string,
  ref: GoveeDeviceRef,
): Promise<SnapshotEntry[]> {
  const res = await axios({
    url: GOVEE_CONTENT_URLS.snapshots,
    method: 'get',
    headers: goveeHeaders(token, clientId),
    params: {
      sku: ref.sku,
      device: ref.device,
      snapshotId: 0,
      sortType: 0,
    },
    timeout: REQUEST_TIMEOUT,
  });

  const list = res.data?.data?.snapshots ?? res.data?.data?.list;
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((snapshot: Record<string, unknown>) => ({
    snapshotId: Number(snapshot.snapshotId ?? snapshot.id ?? 0),
    name: String(snapshot.name ?? snapshot.snapshotName ?? 'Snapshot'),
    iconUrl: typeof snapshot.iconUrl === 'string' ? snapshot.iconUrl : undefined,
  }));
}

/**
 * Ask Govee which modes a device supports, so the config UI can offer only those.
 */
export async function goveeGetFunctionSupport(
  token: string,
  clientId: string,
  ref: GoveeDeviceRef,
): Promise<FunctionSupport> {
  const res = await axios({
    url: GOVEE_CONTENT_URLS.functionSupport,
    method: 'get',
    headers: goveeHeaders(token, clientId),
    params: {
      sku: ref.sku,
      device: ref.device,
      goodsType: ref.goodsType ?? 0,
      pactType: ref.pactType,
      pactCode: ref.pactCode,
      versionSoft: ref.versionSoft,
      versionHard: ref.versionHard,
      wifiVersionSoft: ref.wifiVersionSoft,
      wifiVersionHard: ref.wifiVersionHard,
    },
    timeout: REQUEST_TIMEOUT,
  });

  const raw = res.data?.data;
  const ids: number[] = Array.isArray(raw?.modes)
    ? raw.modes.map((mode: unknown) => (typeof mode === 'number' ? mode : Number((mode as Record<string, unknown>)?.componentId)))
    : Array.isArray(raw?.components)
      ? raw.components.map((component: unknown) => Number((component as Record<string, unknown>)?.componentId ?? component))
      : [];

  const modeIds = ids.filter((id) => Number.isFinite(id));
  return {
    modeIds,
    modes: modeIds.map((id) => GOVEE_MODES[id]).filter((name): name is string => !!name),
  };
}
