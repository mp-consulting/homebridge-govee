import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import { GOVEE_MODES, normaliseSceneLibrary } from '../../src/utils/govee-content.js';
import { getOfflineSceneLibrary, isRgbicSku } from '../../src/utils/scene-catalogue.js';

const RGBIC_PARAM = Buffer.from([
  // one sub-effect, 3 bytes long — a minimal but structurally valid RGBIC payload
  0x01, 0x03, 0x11, 0x22, 0x33,
]).toString('base64');

function categories(overrides: Record<string, unknown> = {}) {
  return [
    {
      categoryId: 5,
      categoryName: 'Natural',
      scenes: [
        {
          sceneId: 130,
          sceneNameNew: { en: 'Forest', fr: 'Forêt' },
          analyticName: 'Forest',
          iconUrls: ['https://cdn/light.png', 'https://cdn/pressed.png', 'https://cdn/dark.png'],
          sceneCode: 212,
          sceneType: 2,
          lightEffects: [
            {
              scenceParamId: 112,
              scenceName: 'Default',
              scenceParam: RGBIC_PARAM,
              sceneCode: 212,
              sceneType: 2,
              ...overrides,
            },
          ],
        },
      ],
    },
  ];
}

describe('normaliseSceneLibrary', () => {
  it('encodes each scene and keeps both icon variants', () => {
    const library = normaliseSceneLibrary(categories(), 'H6173', 'AA:BB');
    const [category] = library.categories;
    const [scene] = category.scenes;

    expect(category.name).toBe('Natural');
    expect(scene.name).toBe('Forest');
    expect(scene.iconUrl).toBe('https://cdn/light.png');
    expect(scene.iconUrlDark).toBe('https://cdn/dark.png');
    expect(scene.code).toBe(scene.variants[0].code);
    expect(scene.code.split(',').length).toBeGreaterThan(1);
  });

  it('prefers the English name, then the plain name, then the analytics name', () => {
    const withoutLocalised = categories();
    delete (withoutLocalised[0].scenes[0] as Record<string, unknown>).sceneNameNew;
    expect(normaliseSceneLibrary(withoutLocalised, 'H6173', 'AA:BB').categories[0].scenes[0].name)
      .toBe('Forest');
  });

  it('applies a per-SKU override when the SKU is listed', () => {
    const overridden = categories({
      specialEffect: [
        { scenceParamId: 3696, scenceParam: RGBIC_PARAM, sceneCode: 999, sceneType: 2, supportSku: ['H6173'] },
      ],
    });

    const mine = normaliseSceneLibrary(overridden, 'H6173', 'AA:BB').categories[0].scenes[0];
    const other = normaliseSceneLibrary(overridden, 'H6001', 'AA:BB').categories[0].scenes[0];

    expect(mine.code).not.toBe(other.code);
    // 999 = 0x03E7, little-endian in the activation frame
    const activation = Buffer.from(mine.code.split(',').at(-1)!, 'base64');
    expect([...activation.subarray(2, 5)]).toEqual([0x04, 0xe7, 0x03]);
  });

  it('ignores an override that does not list our SKU', () => {
    const overridden = categories({
      specialEffect: [{ scenceParam: RGBIC_PARAM, sceneCode: 999, supportSku: ['H9999'] }],
    });
    const plain = normaliseSceneLibrary(categories(), 'H6173', 'AA:BB').categories[0].scenes[0];
    const scene = normaliseSceneLibrary(overridden, 'H6173', 'AA:BB').categories[0].scenes[0];
    expect(scene.code).toBe(plain.code);
  });

  it('exposes every effect variant', () => {
    const multi = categories();
    multi[0].scenes[0].lightEffects.push({
      scenceParamId: 113,
      scenceName: 'Fast',
      scenceParam: RGBIC_PARAM,
      sceneCode: 212,
      sceneType: 2,
    });

    const scene = normaliseSceneLibrary(multi, 'H6173', 'AA:BB').categories[0].scenes[0];
    expect(scene.variants.map(v => v.name)).toEqual(['Default', 'Fast']);
    expect(scene.variants.map(v => v.id)).toEqual([112, 113]);
  });

  it('carries speed and direction metadata through', () => {
    const withSpeed = categories({ speedInfo: { supSpeed: true }, supportDirections: [1, 2] });
    const [variant] = normaliseSceneLibrary(withSpeed, 'H6173', 'AA:BB').categories[0].scenes[0].variants;
    expect(variant.supportsSpeed).toBe(true);
    expect(variant.supportedDirections).toEqual([1, 2]);
  });

  it('drops scenes with no usable scene code', () => {
    const broken = [{ categoryId: 1, categoryName: 'Broken', scenes: [{ sceneId: 1, lightEffects: [{}] }] }];
    expect(normaliseSceneLibrary(broken, 'H6173', 'AA:BB').categories).toHaveLength(0);
  });

  it('falls back to the scene-level code when the effect omits one', () => {
    const noEffectCode = categories();
    delete (noEffectCode[0].scenes[0].lightEffects[0] as Record<string, unknown>).sceneCode;
    const scene = normaliseSceneLibrary(noEffectCode, 'H6173', 'AA:BB').categories[0].scenes[0];
    const activation = Buffer.from(scene.code.split(',').at(-1)!, 'base64');
    expect(activation[3]).toBe(212);
  });

  it('tolerates a missing categories array', () => {
    expect(normaliseSceneLibrary(undefined as never, 'H6173', 'AA:BB').categories).toEqual([]);
  });

  it('marks the source so callers can tell cloud from bundled data', () => {
    expect(normaliseSceneLibrary(categories(), 'H6173', 'AA:BB').source).toBe('cloud');
    expect(normaliseSceneLibrary(categories(), 'H6173', 'AA:BB', 'offline').source).toBe('offline');
  });
});

describe('GOVEE_MODES', () => {
  it('maps the app mode ids used by the capability endpoint', () => {
    expect(GOVEE_MODES[10]).toBe('scene');
    expect(GOVEE_MODES[8]).toBe('music');
    expect(GOVEE_MODES[11]).toBe('diy');
  });
});

describe('offline scene catalogue', () => {
  it('classifies addressable models as RGBIC', () => {
    expect(isRgbicSku('H6173')).toBe(true);
    expect(isRgbicSku('h6173')).toBe(true);
    expect(isRgbicSku('H6001')).toBe(false);
  });

  it('offers the richer scene set to RGBIC models', () => {
    const rgbic = getOfflineSceneLibrary('H6173', 'AA:BB')!;
    const rgb = getOfflineSceneLibrary('H6001', 'AA:BB')!;
    const count = (lib: typeof rgbic) => lib.categories.reduce((sum, c) => sum + c.scenes.length, 0);

    expect(count(rgbic)).toBeGreaterThan(count(rgb));
    expect(rgbic.categories.map(c => c.name)).toContain('Music');
  });

  it('reports itself as the offline source', () => {
    expect(getOfflineSceneLibrary('H6173', 'AA:BB')!.source).toBe('offline');
  });

  it('ships an icon and a usable code for every bundled scene', () => {
    const library = getOfflineSceneLibrary('H6173', 'AA:BB')!;
    const scenes = library.categories.flatMap(c => c.scenes);

    expect(scenes.length).toBeGreaterThan(100);
    for (const scene of scenes) {
      expect(scene.iconUrl, scene.name).toMatch(/^https:\/\//);
      for (const frame of scene.code.split(',')) {
        expect(Buffer.from(frame, 'base64'), scene.name).toHaveLength(20);
      }
    }
  });

  it('ends every scene with a scene-activation frame', () => {
    const library = getOfflineSceneLibrary('H6173', 'AA:BB')!;
    for (const scene of library.categories.flatMap(c => c.scenes)) {
      const activation = Buffer.from(scene.code.split(',').at(-1)!, 'base64');
      expect([...activation.subarray(0, 3)], scene.name).toEqual([0x33, 0x05, 0x04]);
    }
  });
});
