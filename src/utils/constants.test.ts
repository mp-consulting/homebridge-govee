import { describe, it, expect } from 'vitest';
import platformConsts from './constants.js';

describe('model arrays', () => {
  const allCategories = Object.keys(platformConsts.models) as (keyof typeof platformConsts.models)[];

  it('no category has an empty model array', () => {
    for (const category of allCategories) {
      expect(platformConsts.models[category].length, `${category} is empty`).toBeGreaterThan(0);
    }
  });

  it('no duplicate models within a single category', () => {
    for (const category of allCategories) {
      const models = platformConsts.models[category];
      const unique = new Set(models);
      expect(unique.size, `${category} has duplicates`).toBe(models.length);
    }
  });

  it('no model appears in two different categories (except template)', () => {
    const modelToCategories = new Map<string, string[]>();

    for (const category of allCategories) {
      if (category === 'template') {
        continue; // template models intentionally overlap
      }
      for (const model of platformConsts.models[category]) {
        const existing = modelToCategories.get(model) || [];
        existing.push(category);
        modelToCategories.set(model, existing);
      }
    }

    for (const [model, categories] of modelToCategories) {
      expect(categories.length, `${model} appears in: ${categories.join(', ')}`).toBe(1);
    }
  });

  it('all model names follow H/B prefix pattern', () => {
    for (const category of allCategories) {
      for (const model of platformConsts.models[category]) {
        expect(model, `${model} in ${category} has unexpected prefix`).toMatch(/^[HB][A-Z0-9]+$/);
      }
    }
  });
});

describe('special model lists', () => {
  it('matterModels are all known in some category or template', () => {
    const allModels = new Set<string>();
    for (const category of Object.keys(platformConsts.models) as (keyof typeof platformConsts.models)[]) {
      for (const model of platformConsts.models[category]) {
        allModels.add(model);
      }
    }

    for (const model of platformConsts.matterModels) {
      expect(allModels.has(model), `matterModel ${model} not in any category`).toBe(true);
    }
  });

  it('apiBrightnessScale models are all in the rgb category', () => {
    const rgbSet = new Set(platformConsts.models.rgb);
    for (const model of platformConsts.apiBrightnessScale) {
      expect(rgbSet.has(model), `apiBrightnessScale ${model} not in rgb`).toBe(true);
    }
  });

  it('bleBrightnessNoScale models are all in the rgb category', () => {
    const rgbSet = new Set(platformConsts.models.rgb);
    for (const model of platformConsts.bleBrightnessNoScale) {
      expect(rgbSet.has(model), `bleBrightnessNoScale ${model} not in rgb`).toBe(true);
    }
  });

  it('bleColourD models are all in the rgb category', () => {
    const rgbSet = new Set(platformConsts.models.rgb);
    for (const model of platformConsts.bleColourD) {
      expect(rgbSet.has(model), `bleColourD ${model} not in rgb`).toBe(true);
    }
  });

  it('bleColour1501 models are all in the rgb category', () => {
    const rgbSet = new Set(platformConsts.models.rgb);
    for (const model of platformConsts.bleColour1501) {
      expect(rgbSet.has(model), `bleColour1501 ${model} not in rgb`).toBe(true);
    }
  });

  it('awsOutlet1617 models are in the switchSingle category', () => {
    const switchSet = new Set(platformConsts.models.switchSingle);
    for (const model of platformConsts.awsOutlet1617) {
      expect(switchSet.has(model), `awsOutlet1617 ${model} not in switchSingle`).toBe(true);
    }
  });
});

describe('defaultValues', () => {
  it('all default values meet minimum values', () => {
    const defaults = platformConsts.defaultValues;
    const mins = platformConsts.minValues;

    for (const key of Object.keys(mins) as (keyof typeof mins)[]) {
      expect(
        defaults[key],
        `default ${key} (${defaults[key]}) is below min (${mins[key]})`,
      ).toBeGreaterThanOrEqual(mins[key]);
    }
  });

  it('httpRetryCodes are non-empty strings', () => {
    expect(platformConsts.httpRetryCodes.length).toBeGreaterThan(0);
    for (const code of platformConsts.httpRetryCodes) {
      expect(code.length).toBeGreaterThan(0);
    }
  });
});
