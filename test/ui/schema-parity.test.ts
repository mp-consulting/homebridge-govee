/**
 * Keeps the custom UI's hand-written field definitions (`deviceTypes` in
 * homebridge-ui/public/script.js) in step with config.schema.json, which is what the
 * plugin and Homebridge validate against. Nothing else ties the two together.
 *
 * script.js is plain browser code, so it is never executed here: only the `deviceTypes`
 * object literal is cut out of the source and evaluated on its own.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';

interface UiOption {
  value: string;
  label: string;
}

interface UiField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  options?: UiOption[];
  min?: number;
  max?: number;
  default?: unknown;
  defaultOn?: boolean;
  offValue?: number;
  tab?: string;
}

interface UiDeviceType {
  tabs?: { id: string }[];
  fields: UiField[];
}

interface SchemaProp {
  type?: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
  oneOf?: { enum?: unknown[] }[];
  minimum?: number;
  maximum?: number;
  properties?: Record<string, SchemaProp>;
  items?: SchemaProp;
}

const SCRIPT_PATH = new URL('../../homebridge-ui/public/script.js', import.meta.url);
const SCHEMA_PATH = new URL('../../config.schema.json', import.meta.url);

/**
 * Returns the source text of the `{ ... }` literal that starts at `start`, matching
 * braces while skipping anything inside strings, template literals and comments.
 */
function extractBalancedLiteral(src: string, start: number): string {
  if (src[start] !== '{') {
    throw new Error(`Expected "{" at offset ${start}`);
  }
  // Each entry is the closer we are waiting for: '}' for a brace (object or `${`), '`'
  // for the body of a template literal.
  const stack: string[] = [];
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    const top = stack[stack.length - 1];

    if (top === '`') {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '`') {
        stack.pop();
      } else if (ch === '$' && src[i + 1] === '{') {
        stack.push('}');
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (ch === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) {
        throw new Error('Unterminated block comment');
      }
      i = end + 2;
      continue;
    }
    if (ch === '\'' || ch === '"') {
      i++;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') {
          i++;
        } else if (src[i] === '\n') {
          throw new Error(`Unterminated string literal near offset ${i}`);
        }
        i++;
      }
      i++;
      continue;
    }
    if (ch === '`') {
      stack.push('`');
    } else if (ch === '{') {
      stack.push('}');
    } else if (ch === '}') {
      if (stack.pop() !== '}') {
        throw new Error(`Unbalanced "}" at offset ${i}`);
      }
      if (stack.length === 0) {
        return src.slice(start, i + 1);
      }
    }
    i++;
  }
  throw new Error('No matching closing brace found');
}

function loadDeviceTypes(): Record<string, UiDeviceType> {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  const marker = /^const deviceTypes\s*=\s*\{/m.exec(src);
  if (!marker) {
    throw new Error('`const deviceTypes = {` not found in script.js');
  }
  const literal = extractBalancedLiteral(src, marker.index + marker[0].length - 1);
  // An empty context: the literal must be pure data, so any reference to a browser
  // global or helper would throw here rather than pass silently.
  return runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 });
}

const deviceTypes = loadDeviceTypes();
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as { schema: { properties: Record<string, SchemaProp> } };
const schemaProps = schema.schema.properties;

/** Follows a dotted UI id (`musicModeLive.effect`) through nested `properties`. */
function resolveSchemaProp(itemProps: Record<string, SchemaProp>, path: string): SchemaProp | undefined {
  let props: Record<string, SchemaProp> | undefined = itemProps;
  let prop: SchemaProp | undefined;
  for (const key of path.split('.')) {
    prop = props?.[key];
    if (!prop) {
      return undefined;
    }
    props = prop.properties;
  }
  return prop;
}

function schemaEnumValues(prop: SchemaProp): unknown[] | undefined {
  if (prop.enum) {
    return prop.enum;
  }
  if (prop.oneOf) {
    return prop.oneOf.flatMap(entry => entry.enum ?? []);
  }
  return undefined;
}

/**
 * The JSON Schema types each UI control can produce, from handleDeviceFieldChange:
 * checkbox writes `field.checked`; select/iconselect/text write the raw string; number,
 * range and both halves of a togglerange go through parseInt, so they only ever write
 * integers (a schema `number` would accept those too).
 */
const UI_TYPE_TO_SCHEMA_TYPES: Record<string, string[]> = {
  checkbox: ['boolean'],
  text: ['string'],
  select: ['string'],
  iconselect: ['string'],
  number: ['integer', 'number'],
  range: ['integer', 'number'],
  togglerange: ['integer', 'number'],
};

/**
 * What the UI shows for a field the config does not set yet, mirroring
 * renderDeviceField. `undefined` means the control is visibly blank (text/number inputs,
 * an icon select with no default), which reads as "not set" rather than as a value.
 */
function uiDisplayedDefault(field: UiField): unknown {
  switch (field.type) {
    case 'checkbox':
      return field.default ?? false;
    case 'iconselect':
      return field.default;
    case 'select':
      // No option is marked selected, so the browser shows the first one.
      return field.options?.[0]?.value;
    case 'range':
      return field.default ?? field.min ?? 0;
    case 'togglerange':
      return field.defaultOn === false ? field.offValue : (field.default ?? field.min ?? 0);
    default:
      return undefined;
  }
}

/**
 * Schema properties deliberately not rendered from `deviceTypes`. An entry covers the
 * property and everything nested under it.
 */
const NOT_IN_FIELDS_ALLOWLIST: Record<string, Record<string, string>> = {
  lightDevices: {
    // Edited through the Scene Library tab (renderScenesTab / the scene picker), which
    // writes whole scene objects into this array rather than through a field.
    scenes: 'managed by the Scene Library tab',
    // Legacy hand-entered scene codes exposed as Eve characteristics. They predate the
    // scene library, are only meaningful when pasted in from a capture, and are kept
    // untouched in the config by the UI (entries are edited in place), so existing
    // setups keep working. New setups use `scenes` instead.
    scene: 'legacy scene code, superseded by scenes',
    sceneTwo: 'legacy scene code, superseded by scenes',
    sceneThree: 'legacy scene code, superseded by scenes',
    sceneFour: 'legacy scene code, superseded by scenes',
    musicMode: 'legacy scene code, superseded by musicModeLive',
    musicModeTwo: 'legacy scene code, superseded by musicModeLive',
    videoMode: 'legacy scene code, superseded by scenes',
    videoModeTwo: 'legacy scene code, superseded by scenes',
    diyMode: 'legacy scene code, superseded by scenes (kind: diy)',
    diyModeTwo: 'legacy scene code, superseded by scenes (kind: diy)',
    diyModeThree: 'legacy scene code, superseded by scenes (kind: diy)',
    diyModeFour: 'legacy scene code, superseded by scenes (kind: diy)',
    segmented: 'legacy scene code, superseded by scenes',
    segmentedTwo: 'legacy scene code, superseded by scenes',
    segmentedThree: 'legacy scene code, superseded by scenes',
    segmentedFour: 'legacy scene code, superseded by scenes',
  },
};

/** Leaf paths of a device item's schema, skipping allowlisted subtrees. */
function schemaLeafPaths(props: Record<string, SchemaProp>, allow: Record<string, string>, prefix = ''): string[] {
  return Object.entries(props).flatMap(([key, prop]) => {
    const path = prefix + key;
    if (path in allow) {
      return [];
    }
    return prop.properties ? schemaLeafPaths(prop.properties, allow, `${path}.`) : [path];
  });
}

describe('custom UI deviceTypes ↔ config.schema.json parity', () => {
  it('extracts deviceTypes from script.js without a browser', () => {
    expect(Object.keys(deviceTypes).length).toBeGreaterThan(0);
    for (const def of Object.values(deviceTypes)) {
      expect(Array.isArray(def.fields)).toBe(true);
    }
  });

  it('brace matcher ignores braces inside strings, templates and comments', () => {
    const src = 'x = { a: \'}\', b: "{", c: `}${ {d: 1}.d }`, // }\n /* { */ e: { f: \'\\\'}\' } } tail';
    const literal = extractBalancedLiteral(src, src.indexOf('{'));
    expect(literal.endsWith('} }')).toBe(true);
    expect(runInNewContext(`(${literal})`)).toEqual({ a: '}', b: '{', c: '}1', e: { f: '\'}' } });
  });

  it('covers exactly the device arrays the schema defines', () => {
    const schemaDeviceKeys = Object.entries(schemaProps)
      .filter(([, prop]) => prop.type === 'array' && prop.items?.properties)
      .map(([key]) => key);
    expect(Object.keys(deviceTypes).sort()).toEqual(schemaDeviceKeys.sort());
  });

  describe.each(Object.keys(deviceTypes))('%s', (deviceType) => {
    const def = deviceTypes[deviceType];
    const itemProps = schemaProps[deviceType]?.items?.properties ?? {};

    it('has no duplicate field ids', () => {
      const ids = def.fields.map(field => field.id);
      expect(ids).toEqual([...new Set(ids)]);
    });

    it('only puts fields on tabs that exist', () => {
      const tabs = new Set((def.tabs ?? []).map(tab => tab.id));
      for (const field of def.fields.filter(f => f.tab)) {
        expect(tabs, `${field.id} → tab ${field.tab}`).toContain(field.tab);
      }
    });

    it.each(def.fields.map(field => [field.id, field] as const))('field %s matches the schema', (id, field) => {
      const prop = resolveSchemaProp(itemProps, id);
      expect(prop, `${deviceType}.${id} has no schema property`).toBeDefined();
      if (!prop) {
        return;
      }

      const allowedTypes = UI_TYPE_TO_SCHEMA_TYPES[field.type];
      expect(allowedTypes, `unknown UI field type "${field.type}"`).toBeDefined();
      expect(allowedTypes, `${id}: UI ${field.type} vs schema ${prop.type}`).toContain(prop.type);

      expect(Boolean(field.required), `${id}: required flag`).toBe(Boolean(prop.required));

      if (field.type === 'select' || field.type === 'iconselect') {
        const uiValues = (field.options ?? []).map(opt => opt.value);
        expect(uiValues, `${id}: duplicate option values`).toEqual([...new Set(uiValues)]);
        const schemaValues = schemaEnumValues(prop);
        expect(schemaValues, `${id}: schema has no enum/oneOf`).toBeDefined();
        expect([...uiValues].sort()).toEqual([...(schemaValues ?? [])].map(String).sort());
      }

      // Every value the control can write must be one the schema accepts.
      const writable = [field.min, field.max, field.offValue].filter((n): n is number => n !== undefined);
      for (const n of writable) {
        if (prop.minimum !== undefined) {
          expect(n, `${id}: ${n} below schema minimum`).toBeGreaterThanOrEqual(prop.minimum);
        }
        if (prop.maximum !== undefined) {
          expect(n, `${id}: ${n} above schema maximum`).toBeLessThanOrEqual(prop.maximum);
        }
        if (prop.type === 'integer') {
          expect(Number.isInteger(n), `${id}: ${n} is not an integer`).toBe(true);
        }
      }
      if (field.type === 'togglerange') {
        expect(field.offValue, `${id}: togglerange needs an offValue`).toBeDefined();
      }

      // An unset field must not look different in the UI from how the plugin treats it.
      const shown = uiDisplayedDefault(field);
      if (prop.default !== undefined && shown !== undefined) {
        expect(shown, `${id}: UI shows ${String(shown)} but schema default is ${String(prop.default)}`).toEqual(prop.default);
      }
      if (field.default !== undefined && prop.default !== undefined) {
        expect(field.default, `${id}: default`).toEqual(prop.default);
      }
    });

    it('exposes every schema property, or allowlists it with a reason', () => {
      const allow = NOT_IN_FIELDS_ALLOWLIST[deviceType] ?? {};
      for (const path of Object.keys(allow)) {
        expect(resolveSchemaProp(itemProps, path), `stale allowlist entry ${deviceType}.${path}`).toBeDefined();
      }
      const uiIds = new Set(def.fields.map(field => field.id));
      const missing = schemaLeafPaths(itemProps, allow).filter(path => !uiIds.has(path));
      expect(missing, `${deviceType}: schema properties with no UI field`).toEqual([]);
    });
  });

  it('the Scene Library tab exists for the allowlisted lightDevices.scenes', () => {
    expect((deviceTypes.lightDevices?.tabs ?? []).map(tab => tab.id)).toContain('scenes');
  });
});
