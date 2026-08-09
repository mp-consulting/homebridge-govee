// modelCategories and getDeviceTypeFromModel are loaded from models.js
// which is auto-generated from src/utils/constants.ts during build

function escapeHtml(str) {
  if (typeof str !== 'string') {
    return String(str ?? '');
  }
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Device type configurations
const deviceTypes = {
  lightDevices: {
    // A light does far more than any other device type, so its editor is split into
    // tabs. Fields land in `general` unless they name a tab. `mode` gates a whole tab on
    // what Govee says the hardware supports.
    tabs: [
      { id: 'general', title: 'General', icon: 'bi-sliders2' },
      { id: 'scenes', title: 'Scene Library', icon: 'bi-palette', mode: 'scene' },
      { id: 'music', title: 'Music Mode', icon: 'bi-music-note-beamed', mode: 'music' },
    ],
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true,
        help: 'Govee\'s own identifier for this light. Run Discover Devices on the Tools tab and it is filled in for you.' },
      { id: 'label', label: 'Custom Label', type: 'text',
        help: 'Replaces the name HomeKit shows. Leave blank to keep the name set in the Govee app.' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox',
        help: 'Keeps this light out of HomeKit without discarding any of the settings below.' },
      { id: 'showAs', label: 'Show As', type: 'select',
        help: 'A Light gets brightness and colour controls. Pick Switch for a light you only ever turn on and off.',
        options: [
          { value: 'default', label: 'Light (default)' },
          { value: 'switch', label: 'Switch' },
        ] },
      { id: 'musicModeLive.enabled', label: 'Add a Music tile to HomeKit', type: 'checkbox',
        tab: 'music',
        help: 'Adds a second tile for this light. On/off starts music mode, brightness is the microphone sensitivity, and colour sets the music colour.' },
      { id: 'musicModeLive.effect', label: 'Effect', type: 'iconselect', default: 'rhythm',
        tab: 'music',
        help: 'How the light reacts to sound. Rhythm follows the beat, Energic flashes on peaks, Rolling sweeps colour along the strip, and Spectrum maps pitch to colour.',
        options: [
          { value: 'rhythm', label: 'Rhythm', icon: 'bi-soundwave' },
          { value: 'energic', label: 'Energic', icon: 'bi-lightning-charge' },
          { value: 'rolling', label: 'Rolling', icon: 'bi-water' },
          { value: 'spectrum', label: 'Spectrum', icon: 'bi-bar-chart-line' },
        ] },
      { id: 'musicModeLive.sensitivity', label: 'Default Sensitivity', type: 'range', min: 0, max: 100, step: 5,
        default: 50, unit: '%', tab: 'music',
        help: 'How loud a sound must be before the light reacts. This is only the starting value — the tile\'s brightness slider changes it live.' },
      { id: 'musicModeLive.autoColour', label: 'Auto Colour', type: 'checkbox', tab: 'music',
        help: 'Let the light pick colours from the music itself. Turn this off to choose the colour yourself, from the tile\'s colour picker.' },
      { id: 'musicModeLive.soft', label: 'Soft Rhythm', type: 'checkbox', tab: 'music',
        help: 'Rhythm only: the gentler of its two styles, with slower fades between beats.' },
      { id: 'musicModeLive.protocol', label: 'Protocol', type: 'select', tab: 'music',
        help: 'Older lights speak an earlier version of the music command. If the tile appears but does nothing, switch to Legacy.',
        options: [
          { value: 'modern', label: 'Modern' },
          { value: 'legacy', label: 'Legacy (older lights)' },
        ] },
      { id: 'customIPAddress', label: 'Custom IP Address', type: 'text', advanced: true,
        help: 'Only for LAN control, when the light is not found automatically. Pair it with a DHCP reservation so the address does not move.' },
      { id: 'customAddress', label: 'Custom BLE Address', type: 'text', advanced: true,
        help: 'The light\'s Bluetooth MAC address. Only needed when Bluetooth control cannot find the device by name.' },
      { id: 'brightnessStep', label: 'Brightness Step', type: 'range', min: 1, max: 100, step: 1,
        default: 1, unit: '%', advanced: true,
        help: 'Smallest brightness change HomeKit will send. Raise it to stop a dragged slider flooding the light with updates.' },
      { id: 'adaptiveLightingShift', label: 'Adaptive Lighting', type: 'togglerange', advanced: true,
        offValue: -1, default: 0, min: 0, max: 500, step: 10, unit: ' mireds',
        rangeLabel: 'Warmth shift',
        help: 'Lets HomeKit track the colour temperature to the time of day. Turn it off to keep whatever colour you set.',
        rangeHelp: 'Biases the curve warmer than Apple\'s. 150 keeps evenings noticeably cosier; 0 follows HomeKit exactly.' },
      { id: 'awsBrightnessNoScale', label: 'AWS Brightness No Scale', type: 'checkbox', advanced: true,
        help: 'Sends brightness as 0-100 instead of 0-254. A few models need this, otherwise they jump straight to full brightness.' },
      { id: 'awsColourMode', label: 'AWS Colour Mode', type: 'select', advanced: true,
        help: 'Which shape of colour command this model accepts over the cloud connection. Change it only if colours are ignored or come out wrong.',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'rgb', label: 'RGB' },
          { value: 'redgreenblue', label: 'Red/Green/Blue' },
        ] },
    ],
  },
  switchDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
      { id: 'showAs', label: 'Show As', type: 'select', options: [
        { value: 'default', label: 'Outlet (default)' },
        { value: 'switch', label: 'Switch' },
        { value: 'purifier', label: 'Air Purifier' },
        { value: 'heater', label: 'Heater' },
        { value: 'cooler', label: 'Cooler' },
        { value: 'tap', label: 'Tap/Faucet' },
        { value: 'valve', label: 'Valve' },
        { value: 'audio', label: 'Audio Receiver' },
        { value: 'box', label: 'Set-Top Box' },
        { value: 'stick', label: 'Streaming Stick' },
      ] },
      { id: 'temperatureSource', label: 'Temperature Source (Device ID)', type: 'text', advanced: true },
    ],
  },
  thermoDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
      { id: 'lowBattThreshold', label: 'Low Battery Threshold (%)', type: 'number', min: 1, max: 100 },
      { id: 'showExtraSwitch', label: 'Show Extra Switch', type: 'checkbox' },
    ],
  },
  leakDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
      { id: 'lowBattThreshold', label: 'Low Battery Threshold (%)', type: 'number', min: 1, max: 100 },
    ],
  },
  fanDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
      { id: 'hideLight', label: 'Hide Light Control', type: 'checkbox' },
    ],
  },
  heaterDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
      { id: 'tempReporting', label: 'Temperature Reporting', type: 'checkbox' },
    ],
  },
  humidifierDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
    ],
  },
  purifierDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
    ],
  },
  dehumidifierDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
    ],
  },
  diffuserDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
    ],
  },
  kettleDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
      { id: 'hideModeGreenTea', label: 'Hide Green Tea Mode', type: 'checkbox', advanced: true },
      { id: 'hideModeOolongTea', label: 'Hide Oolong Tea Mode', type: 'checkbox', advanced: true },
      { id: 'hideModeCoffee', label: 'Hide Coffee Mode', type: 'checkbox', advanced: true },
      { id: 'hideModeBlackTea', label: 'Hide Black Tea Mode', type: 'checkbox', advanced: true },
      { id: 'showCustomMode1', label: 'Show Custom Mode 1', type: 'checkbox', advanced: true },
      { id: 'showCustomMode2', label: 'Show Custom Mode 2', type: 'checkbox', advanced: true },
    ],
  },
  iceMakerDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
    ],
  },
};

let pluginConfig = { platform: 'Govee', name: 'Govee' };
const editingState = {}; // { lightDevices: 0, ... } — tracks which device index is open per type

/**
 * Whether the Advanced block is open, per device type. Picking a scene re-renders the
 * whole card, and without this the block would snap shut each time.
 */
const advancedOpen = {};

/**
 * Which editor tab is open, per device type, for the same reason: a re-render must not
 * throw the user back to General while they are picking scenes.
 */
const activeTab = {};

/**
 * Govee product identifiers per device id, learned from discovery. The scene, DIY and
 * capability endpoints all need `goodsType`, which is not part of the plugin config.
 */
const deviceMeta = {};

/** Scene libraries already fetched, keyed by device id. */
const sceneLibraryCache = {};

/** Which modes Govee says a device supports; `null` means "unknown, show everything". */
const capabilityCache = {};

/** Scene icons already inlined by the server, keyed by source URL. */
const iconCache = new Map();

/** Reads a possibly dotted path, e.g. `musicModeLive.effect`. */
function getFieldValue(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/** Writes a possibly dotted path, creating intermediate objects as needed. */
function setFieldValue(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let target = obj;
  for (const key of keys) {
    if (typeof target[key] !== 'object' || target[key] === null) {
      target[key] = {};
    }
    target = target[key];
  }
  if (value === undefined) {
    delete target[last];
  } else {
    target[last] = value;
  }
}

/** A dotted id cannot go straight into an element id attribute. */
function fieldElementId(type, index, fieldId) {
  return `${type}_${index}_${fieldId.replace(/\./g, '__')}`;
}

/**
 * Hide fields for modes Govee says the device does not have. When capabilities are
 * unknown every field is shown — an empty capability list must never silently remove
 * controls the user relies on.
 */
function fieldAppliesToDevice(field, device) {
  if (!field.mode) {
    return true;
  }
  const modes = capabilityCache[device.deviceId];
  return !modes || modes.includes(field.mode);
}

function renderDeviceField(type, index, field, value) {
  const fieldId = fieldElementId(type, index, field.id);
  const help = field.help
    ? `<div class="form-text small">${escapeHtml(field.help)}</div>`
    : '';
  let inner;

  if (field.type === 'checkbox') {
    inner = `
      <div class="form-check form-switch mt-1">
        <input class="form-check-input device-field" type="checkbox" id="${fieldId}"
          data-type="${type}" data-index="${index}" data-field="${field.id}"
          ${value ? 'checked' : ''}>
        <label class="form-check-label" for="${fieldId}">${field.label}</label>
      </div>${help}`;
  } else if (field.type === 'iconselect') {
    // A native <option> cannot carry an icon, so a short list of visual choices is
    // rendered as a segmented control of radio buttons instead.
    const current = value ?? field.default;
    const buttons = field.options.map((opt, optIndex) => {
      const optId = `${fieldId}_${optIndex}`;
      return `
        <input type="radio" class="btn-check device-field" name="${fieldId}" id="${optId}"
          value="${escapeHtml(opt.value)}"
          data-type="${type}" data-index="${index}" data-field="${field.id}"
          ${current === opt.value ? 'checked' : ''}>
        <label class="btn btn-outline-secondary" for="${optId}">
          ${opt.icon ? `<i class="bi ${opt.icon}"></i>` : ''}
          <span>${escapeHtml(opt.label)}</span>
        </label>`;
    }).join('');
    inner = `
      <label class="form-label">${field.label}</label>
      <div class="btn-group btn-group-sm gv-icon-select w-100" role="group" aria-label="${escapeHtml(field.label)}">
        ${buttons}
      </div>${help}`;
  } else if (field.type === 'range') {
    const current = value ?? field.default ?? field.min ?? 0;
    inner = `
      <label class="form-label d-flex justify-content-between align-items-center" for="${fieldId}">
        <span>${field.label}</span>
        <output class="badge bg-secondary" id="${fieldId}_out">${current}${field.unit || ''}</output>
      </label>
      <input type="range" class="form-range device-field" id="${fieldId}"
        data-type="${type}" data-index="${index}" data-field="${field.id}"
        data-unit="${escapeHtml(field.unit || '')}"
        min="${field.min ?? 0}" max="${field.max ?? 100}" step="${field.step ?? 1}"
        value="${current}">${help}`;
  } else if (field.type === 'togglerange') {
    // One stored number that means two things: a sentinel for "off", or an amount. Split
    // into the switch and the slider the value actually represents, rather than making
    // the user know that -1 is magic.
    const off = field.offValue;
    const isOn = value === undefined ? field.defaultOn !== false : value !== off;
    const amount = (value === undefined || value === off) ? (field.default ?? field.min ?? 0) : value;
    const toggleId = `${fieldId}_on`;
    const rangeId = `${fieldId}_amount`;
    inner = `
      <div class="form-check form-switch mt-1">
        <input class="form-check-input device-field" type="checkbox" id="${toggleId}"
          data-type="${type}" data-index="${index}" data-field="${field.id}"
          data-field-role="toggle" data-off-value="${off}" data-on-value="${amount}"
          ${isOn ? 'checked' : ''}>
        <label class="form-check-label" for="${toggleId}">${field.label}</label>
      </div>${help}
      <div class="pt-2 ${isOn ? '' : 'd-none'}" data-togglerange-body="${toggleId}">
        <label class="form-label d-flex justify-content-between align-items-center mb-1" for="${rangeId}">
          <span class="small">${escapeHtml(field.rangeLabel || field.label)}</span>
          <output class="badge bg-secondary" id="${rangeId}_out">${amount}${field.unit || ''}</output>
        </label>
        <input type="range" class="form-range device-field" id="${rangeId}"
          data-type="${type}" data-index="${index}" data-field="${field.id}"
          data-field-role="range" data-toggle-for="${toggleId}"
          data-unit="${escapeHtml(field.unit || '')}"
          min="${field.min ?? 0}" max="${field.max ?? 100}" step="${field.step ?? 1}"
          value="${amount}">
        ${field.rangeHelp ? `<div class="form-text small">${escapeHtml(field.rangeHelp)}</div>` : ''}
      </div>`;
  } else if (field.type === 'select') {
    const options = field.options.map(opt =>
      `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`,
    ).join('');
    inner = `
      <label class="form-label" for="${fieldId}">${field.label}</label>
      <select class="form-select form-select-sm device-field" id="${fieldId}"
        data-type="${type}" data-index="${index}" data-field="${field.id}">
        ${options}
      </select>${help}`;
  } else {
    inner = `
      <label class="form-label" for="${fieldId}">${field.label}${field.required ? ' *' : ''}</label>
      <input type="${field.type}" class="form-control form-control-sm device-field" id="${fieldId}"
        data-type="${type}" data-index="${index}" data-field="${field.id}"
        value="${escapeHtml(value ?? '')}" ${field.min !== undefined ? `min="${field.min}"` : ''}
        ${field.max !== undefined ? `max="${field.max}"` : ''}>${help}`;
  }
  return `<div class="col-md-6">${inner}</div>`;
}

/**
 * The Scene Library tab: what is currently selected on top, the library to pick from
 * below it. Both halves stay on screen, so a tile toggled in the picker is seen landing
 * in the selection immediately.
 */
function renderScenesTab(type, index, device) {
  return `
    <div class="gv-field-group">
      <div id="selectedScenesPanel">${renderSelectedScenes(type, index, device.scenes)}</div>
    </div>
    <div class="gv-field-group">
      <h6 class="gv-field-group-title">
        <i class="bi bi-grid-3x3-gap me-2"></i>Add from the Govee library
      </h6>
      <div id="scenePickerStatus"></div>
      <div id="scenePickerBody">
        <div class="text-center py-4"><span class="spinner-border" role="status"></span></div>
      </div>
      <div class="d-flex justify-content-between align-items-start gap-3 pt-2">
        <span class="text-muted small" id="scenePickerCount">0 scenes selected</span>
        <span class="text-warning small text-end d-none" id="scenePickerWarning"></span>
      </div>
    </div>`;
}

/**
 * The chosen-scenes panel: a header explaining what a scene becomes in HomeKit, and the
 * current selection as icon chips. Rendered on its own so a selection change can refresh
 * just this half, leaving the picker's scroll position and open category alone.
 */
function renderSelectedScenes(type, index, scenes) {
  const chosen = Array.isArray(scenes) ? scenes : [];
  const sceneCount = chosen.filter(scene => scene.kind !== 'diy').length;
  const diyCount = chosen.length - sceneCount;

  const summary = chosen.length === 0
    ? 'Nothing selected yet'
    : [
      sceneCount ? `${sceneCount} scene${sceneCount === 1 ? '' : 's'}` : '',
      diyCount ? `${diyCount} DIY effect${diyCount === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' · ');

  const body = chosen.length === 0
    ? `<div class="gv-scene-empty">
         <i class="bi bi-palette"></i>
         <p class="mb-1 fw-medium">No scenes selected</p>
         <p class="text-muted small mb-0">
           Pick scenes and your own DIY effects from the library below.
           Each one becomes its own switch in HomeKit.
         </p>
       </div>`
    : `<div class="gv-scene-strip">${chosen.map((scene, sceneIndex) => `
        <div class="gv-scene-chip" title="${escapeHtml(scene.name || '')}">
          ${sceneIconMarkup(scene)}
          <span class="gv-scene-chip-name">${escapeHtml(scene.name || 'Scene')}</span>
          ${scene.kind === 'diy' ? '<span class="badge bg-secondary gv-scene-chip-kind">DIY</span>' : ''}
          <button type="button" class="btn-close btn-close-sm"
            aria-label="Remove ${escapeHtml(scene.name || 'scene')}"
            onclick="removeScene('${type}', ${index}, ${sceneIndex})"></button>
        </div>`).join('')}</div>`;

  return `
    <div class="gv-scene-panel">
      <div class="gv-scene-panel-head">
        <div class="min-w-0">
          <div class="fw-semibold"><i class="bi bi-check2-square me-2"></i>Selected scenes</div>
          <div class="text-muted small">${escapeHtml(summary)}</div>
        </div>
        ${chosen.length > 0 ? `
          <button type="button" class="btn btn-outline-danger btn-sm flex-shrink-0"
            onclick="clearScenes('${type}', ${index})">Clear all</button>` : ''}
      </div>
      <div class="gv-scene-panel-body">${body}</div>
    </div>`;
}

/**
 * An icon tile. The image src is filled in later by `hydrateSceneIcons()` because the
 * bytes have to be proxied through the plugin server.
 */
function sceneIconMarkup(scene, extraClass = '') {
  const url = scene.iconUrl || scene.iconUrlDark;
  if (!url) {
    return `<span class="gv-scene-icon gv-scene-icon-empty ${extraClass}"><i class="bi bi-palette"></i></span>`;
  }
  const cached = iconCache.get(url);
  if (cached) {
    return `<img class="gv-scene-icon ${extraClass}" src="${escapeHtml(cached)}" alt="">`;
  }
  return `<img class="gv-scene-icon ${extraClass}" data-icon-url="${escapeHtml(url)}" alt="">`;
}

/** Icons waiting to be fetched: source URL -> the <img> elements showing it. */
const iconQueue = new Map();
let iconFlushTimer = null;

/**
 * Icons per request. The server applies the same cap and silently drops the surplus, so
 * the queue has to be split here or the extra tiles never get an image — `queueIcon` has
 * already cleared their `data-icon-url`, so nothing would ask for them again.
 */
const ICON_BATCH_SIZE = 60;

/**
 * Send the queued icon URLs as a single request and fill in the images.
 *
 * Batched deliberately: every proxied request writes a line to the Homebridge log, and
 * a scene library can hold 150 icons. Coalescing a burst of newly-visible tiles into
 * one call keeps the log readable and cuts the round trips.
 */
async function flushIconQueue() {
  iconFlushTimer = null;
  if (iconQueue.size === 0) {
    return;
  }

  const pending = [...iconQueue];
  iconQueue.clear();

  for (let start = 0; start < pending.length; start += ICON_BATCH_SIZE) {
    await fetchIconBatch(pending.slice(start, start + ICON_BATCH_SIZE));
  }
}

/** Fetch one server-sized batch of icons and apply them to their waiting tiles. */
async function fetchIconBatch(batch) {
  try {
    const response = await window.homebridge.request('/scene-icons', { urls: batch.map(([url]) => url) });
    const icons = response?.icons || {};
    for (const [url, images] of batch) {
      const dataUri = icons[url];
      if (dataUri) {
        iconCache.set(url, dataUri);
      }
      for (const img of images) {
        if (dataUri) {
          img.src = dataUri;
        } else {
          // A missing icon is cosmetic; show the placeholder rather than a broken image.
          img.classList.add('gv-scene-icon-empty');
        }
      }
    }
  } catch {
    for (const [, images] of batch) {
      images.forEach(img => img.classList.add('gv-scene-icon-empty'));
    }
  }
}

function queueIcon(img) {
  const url = img.dataset.iconUrl;
  if (!url) {
    return;
  }
  delete img.dataset.iconUrl;

  const cached = iconCache.get(url);
  if (cached) {
    img.src = cached;
    return;
  }

  const waiting = iconQueue.get(url);
  if (waiting) {
    // The same icon can appear on several tiles; fetch it once, apply it to all.
    waiting.push(img);
    return;
  }
  iconQueue.set(url, [img]);

  if (!iconFlushTimer) {
    iconFlushTimer = setTimeout(flushIconQueue, 60);
  }
}

/**
 * Fetch any not-yet-loaded scene icons inside `root`.
 *
 * Icons are proxied by the plugin server rather than loaded straight from Govee's CDN,
 * and are only requested once their tile scrolls into view.
 */
function hydrateSceneIcons(root) {
  const pending = root.querySelectorAll('img[data-icon-url]');
  if (pending.length === 0) {
    return;
  }

  if (typeof IntersectionObserver !== 'function') {
    pending.forEach(queueIcon);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        queueIcon(entry.target);
      }
    }
  }, { rootMargin: '200px' });

  pending.forEach(img => observer.observe(img));
}

function renderDeviceRow(type, index, device) {
  const isIgnored = device.ignoreDevice;
  const displayName = device.label || device.deviceId || 'New Device';
  const deviceId = device.deviceId || '';

  return `
    <div class="device-row d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
      <div class="flex-grow-1 min-w-0 me-2 ${isIgnored ? 'opacity-50' : ''}">
        <div class="fw-medium">${escapeHtml(displayName)}${isIgnored ? ' <span class="badge bg-secondary ms-1">Ignored</span>' : ''}</div>
        ${deviceId ? `<code class="small text-muted">${escapeHtml(deviceId)}</code>` : ''}
      </div>
      <div class="d-flex gap-1 flex-shrink-0">
        <button class="btn btn-outline-primary btn-sm" onclick="editDevice('${type}', ${index})">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-outline-danger btn-sm" onclick="removeDevice('${type}', ${index})">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </div>`;
}

/**
 * Render one pane's worth of fields, split into the sub-headed groups declared on the
 * device type. Ungrouped fields come first, so a section reads as "the main thing,
 * then its related settings".
 */
function renderFieldGroups(type, index, device, fields, groupDefs = {}) {
  const render = f => renderDeviceField(type, index, f, getFieldValue(device, f.id));
  const ungrouped = fields.filter(f => !f.group);

  // Preserve the order groups are declared in, then any not declared.
  const groupNames = [
    ...Object.keys(groupDefs).filter(name => fields.some(f => f.group === name)),
    ...[...new Set(fields.map(f => f.group))].filter(name => name && !groupDefs[name]),
  ];

  const blocks = [];
  if (ungrouped.length > 0) {
    blocks.push(`<div class="row g-3">${ungrouped.map(render).join('')}</div>`);
  }

  for (const name of groupNames) {
    const def = groupDefs[name] || { title: name };
    const groupFields = fields.filter(f => f.group === name);
    blocks.push(`
      <div class="gv-field-group">
        <h6 class="gv-field-group-title">
          ${def.icon ? `<i class="bi ${def.icon} me-2"></i>` : ''}${escapeHtml(def.title)}
        </h6>
        <div class="row g-3">${groupFields.map(render).join('')}</div>
      </div>`);
  }

  return blocks.join('');
}

/** One stacked block: an optional heading followed by its fields. */
function renderSectionBlock(def, inner) {
  const heading = def.showTitle === false
    ? ''
    : `<h6 class="gv-field-group-title">
         ${def.icon ? `<i class="bi ${def.icon} me-2"></i>` : ''}${escapeHtml(def.title)}
       </h6>`;
  return `<div class="gv-field-group">${heading}${inner}</div>`;
}

/** The rarely-touched settings, in a disclosure that remembers whether it was open. */
function renderAdvancedBlock(type, index, inner) {
  const collapseId = `${type}_${index}_advanced`;
  const open = !!advancedOpen[type];
  return `
    <div class="gv-field-group">
      <button class="gv-advanced-toggle ${open ? '' : 'collapsed'}" type="button"
        data-advanced-toggle="${type}"
        data-bs-toggle="collapse" data-bs-target="#${collapseId}"
        aria-expanded="${open}" aria-controls="${collapseId}">
        <i class="bi bi-chevron-right gv-advanced-chevron"></i>
        <i class="bi bi-sliders2 me-2"></i>Advanced settings
      </button>
      <div class="collapse ${open ? 'show' : ''}" id="${collapseId}">
        <div class="pt-3">${inner}</div>
      </div>
    </div>`;
}

/** Whether a whole tab applies, given what Govee says the device supports. */
function tabAppliesToDevice(tab, device) {
  if (!tab.mode) {
    return true;
  }
  const modes = capabilityCache[device.deviceId];
  return !modes || modes.includes(tab.mode);
}

/**
 * The stacked editor: every setting visible at once, used by every device type that is
 * simple enough to read in one pass.
 */
function renderStackedBody(type, index, device, config) {
  const applicable = config.fields.filter(f => fieldAppliesToDevice(f, device));
  const groupDefs = config.groups || {};
  const groups = fields => renderFieldGroups(type, index, device, fields, groupDefs);

  const blocks = [];
  const mainFields = applicable.filter(f => !f.advanced);
  if (mainFields.length > 0) {
    blocks.push(renderSectionBlock({ showTitle: false }, groups(mainFields)));
  }

  const advancedFields = applicable.filter(f => f.advanced);
  if (advancedFields.length > 0) {
    blocks.push(renderAdvancedBlock(type, index, groups(advancedFields)));
  }
  return blocks.join('');
}

/**
 * The tabbed editor, used for lights. A light carries three unrelated concerns — how it
 * appears in HomeKit, its scene library, and music mode — and stacking all of them made
 * a card long enough that the scene grid pushed everything else off screen.
 *
 * The open tab is remembered per device type, because toggling a scene re-renders.
 */
function renderTabbedBody(type, index, device, config) {
  const applicable = config.fields.filter(f => fieldAppliesToDevice(f, device));
  const groupDefs = config.groups || {};
  const groups = fields => renderFieldGroups(type, index, device, fields, groupDefs);

  const panes = config.tabs
    .filter(tab => tabAppliesToDevice(tab, device))
    .map((tab) => {
      // The scene tab is not a list of fields; it is two stacked panels.
      if (tab.id === 'scenes') {
        return { tab, inner: renderScenesTab(type, index, device) };
      }
      const mine = applicable.filter(f => (f.tab || 'general') === tab.id);
      const plain = mine.filter(f => !f.advanced);
      const advanced = mine.filter(f => f.advanced);
      if (plain.length === 0 && advanced.length === 0) {
        return { tab, inner: '' };
      }
      return {
        tab,
        inner: (plain.length ? renderSectionBlock({ showTitle: false }, groups(plain)) : '')
          + (advanced.length ? renderAdvancedBlock(type, index, groups(advanced)) : ''),
      };
    })
    .filter(entry => entry.inner);

  // With only one tab left standing there is nothing to switch between.
  if (panes.length <= 1) {
    return panes[0]?.inner || '';
  }

  const wanted = activeTab[type];
  const active = panes.some(p => p.tab.id === wanted) ? wanted : panes[0].tab.id;

  const nav = panes.map(({ tab }) => `
    <li class="nav-item" role="presentation">
      <button class="nav-link ${tab.id === active ? 'active' : ''}" type="button" role="tab"
        data-bs-toggle="tab" data-bs-target="#${type}_${index}_tab_${tab.id}"
        data-device-tab="${tab.id}" data-device-type="${type}" data-device-index="${index}">
        <i class="bi ${tab.icon} me-2"></i>${escapeHtml(tab.title)}
      </button>
    </li>`).join('');

  const content = panes.map(({ tab, inner }) => `
    <div class="tab-pane fade ${tab.id === active ? 'show active' : ''}"
      id="${type}_${index}_tab_${tab.id}" role="tabpanel">${inner}</div>`).join('');

  return `
    <ul class="nav nav-tabs gv-device-tabs mb-3" role="tablist">${nav}</ul>
    <div class="tab-content">${content}</div>`;
}

/**
 * The device editor card. Lights get tabs; everything else gets one scrolling form.
 */
function renderDeviceEditForm(type, index, device) {
  const config = deviceTypes[type];
  const displayName = device.label || device.deviceId || 'New Device';
  const body = config.tabs
    ? renderTabbedBody(type, index, device, config)
    : renderStackedBody(type, index, device, config);

  return `
    <div class="card" id="${type}_${index}_card">
      <div class="card-header d-flex justify-content-between align-items-center py-2">
        <span class="fw-semibold">${escapeHtml(displayName)}</span>
        <button class="btn btn-sm btn-outline-secondary" onclick="cancelEdit('${type}')">
          <i class="bi bi-arrow-left me-1"></i>Back
        </button>
      </div>
      <div class="card-body">${body}</div>
    </div>`;
}

function renderDeviceList(type) {
  const devices = pluginConfig[type] || [];
  const container = document.getElementById(`${type}List`);
  const countBadge = document.getElementById(`${type}Count`);

  if (editingState[type] !== undefined) {
    const index = editingState[type];
    container.innerHTML = renderDeviceEditForm(type, index, devices[index] || {});
  } else if (devices.length === 0) {
    container.innerHTML = '<p class="text-muted small mb-0">No devices configured.</p>';
  } else {
    container.innerHTML = `<div class="device-list-items">${devices.map((d, i) => renderDeviceRow(type, i, d)).join('')}</div>`;
    // Auto-expand accordion section when it has devices
    const collapseEl = document.getElementById(`${type}Collapse`);
    if (collapseEl && !collapseEl.classList.contains('show')) {
      collapseEl.classList.add('show');
      const btn = collapseEl.closest('.accordion-item')?.querySelector('.accordion-button');
      if (btn) {
        btn.classList.remove('collapsed');
        btn.setAttribute('aria-expanded', 'true');
      }
    }
  }

  countBadge.textContent = devices.length;
  countBadge.className = `badge me-2 ${devices.length > 0 ? 'bg-primary' : 'bg-secondary'}`;

  // Add event listeners for field changes (only relevant in edit mode)
  container.querySelectorAll('.device-field').forEach(field => {
    field.addEventListener('change', handleDeviceFieldChange);
    field.addEventListener('input', handleDeviceFieldChange);
  });

  // Remember the Advanced disclosure so re-rendering (e.g. after picking a scene)
  // does not close it under the user
  container.querySelectorAll('[data-advanced-toggle]').forEach(toggle => {
    toggle.addEventListener('click', () => {
      advancedOpen[toggle.dataset.advancedToggle] = toggle.classList.contains('collapsed');
    });
  });

  // Remember the open editor tab, and load the scene library the first time its tab is
  // actually shown — tiles in a hidden pane have no size, so icons cannot hydrate there.
  container.querySelectorAll('[data-device-tab]').forEach(tab => {
    tab.addEventListener('shown.bs.tab', () => {
      const { deviceTab, deviceType, deviceIndex } = tab.dataset;
      activeTab[deviceType] = deviceTab;
      if (deviceTab === 'scenes') {
        loadScenePicker(deviceType, Number(deviceIndex));
      }
      hydrateSceneIcons(container);
    });
  });

  // The Scene Library tab can already be the open one after a re-render.
  const openTab = container.querySelector('[data-device-tab].active');
  if (openTab?.dataset.deviceTab === 'scenes') {
    loadScenePicker(openTab.dataset.deviceType, Number(openTab.dataset.deviceIndex));
  }

  hydrateSceneIcons(container);
}

/**
 * Re-render a device list without stealing the caret. `renderDeviceList` replaces the
 * whole card, so an async re-render (a capability answer arriving) would otherwise drop
 * the focus and cursor position of a field the user is still typing in.
 */
function renderDeviceListPreservingFocus(type) {
  const active = document.activeElement;
  const activeId = active?.id;
  const isText = typeof active?.selectionStart === 'number';
  const selectionStart = isText ? active.selectionStart : null;
  const selectionEnd = isText ? active.selectionEnd : null;

  renderDeviceList(type);

  if (!activeId) {
    return;
  }
  const restored = document.getElementById(activeId);
  if (!restored) {
    return;
  }
  restored.focus();
  if (selectionStart !== null && typeof restored.setSelectionRange === 'function') {
    restored.setSelectionRange(selectionStart, selectionEnd);
  }
}

function handleDeviceFieldChange(event) {
  const field = event.target;
  const type = field.dataset.type;
  const index = parseInt(field.dataset.index);
  const fieldName = field.dataset.field;

  if (!pluginConfig[type]) {
    pluginConfig[type] = [];
  }
  if (!pluginConfig[type][index]) {
    pluginConfig[type][index] = {};
  }

  const entry = pluginConfig[type][index];
  const role = field.dataset.fieldRole;

  // The two halves of a `togglerange` write to the same key, so they are handled before
  // the plain checkbox/range branches below would claim them.
  if (role === 'toggle') {
    setFieldValue(entry, fieldName, Number(field.checked ? field.dataset.onValue : field.dataset.offValue));
    const body = document.querySelector(`[data-togglerange-body="${field.id}"]`);
    if (body) {
      body.classList.toggle('d-none', !field.checked);
    }
    return;
  }
  if (role === 'range') {
    const amount = parseInt(field.value, 10);
    setFieldValue(entry, fieldName, isNaN(amount) ? undefined : amount);
    const output = document.getElementById(`${field.id}_out`);
    if (output) {
      output.textContent = `${field.value}${field.dataset.unit || ''}`;
    }
    // Remember the amount so switching off and back on restores it rather than the default
    const toggle = document.getElementById(field.dataset.toggleFor);
    if (toggle) {
      toggle.dataset.onValue = field.value;
    }
    return;
  }

  if (field.type === 'radio') {
    // Only the newly-selected button of a segmented control carries the value
    if (field.checked) {
      setFieldValue(entry, fieldName, field.value);
    }
  } else if (field.type === 'checkbox') {
    setFieldValue(entry, fieldName, field.checked);
  } else if (field.type === 'number' || field.type === 'range') {
    const val = parseInt(field.value, 10);
    setFieldValue(entry, fieldName, isNaN(val) ? undefined : val);
    // Keep the slider's readout in step as it is dragged
    const output = document.getElementById(`${field.id}_out`);
    if (output) {
      output.textContent = `${field.value}${field.dataset.unit || ''}`;
    }
  } else {
    const val = field.value.trim();
    setFieldValue(entry, fieldName, val || undefined);
  }
}

function addDevice(type) {
  if (!pluginConfig[type]) {
    pluginConfig[type] = [];
  }
  const newIndex = pluginConfig[type].length;
  pluginConfig[type].push({ deviceId: '' });
  editingState[type] = newIndex;
  renderDeviceList(type);
}

function removeDevice(type, index) {
  if (pluginConfig[type]) {
    pluginConfig[type].splice(index, 1);
    if (pluginConfig[type].length === 0) {
      delete pluginConfig[type];
    }
    delete editingState[type];
    renderDeviceList(type);
  }
}

function editDevice(type, index) {
  editingState[type] = index;
  renderDeviceList(type);
  loadDeviceCapabilities(type, index);
}

/**
 * Ask Govee which modes this device supports and re-render once the answer arrives, so
 * the card only offers controls the hardware actually has. Failures are silent: the
 * card stays as rendered, showing everything.
 */
async function loadDeviceCapabilities(type, index) {
  const device = pluginConfig[type]?.[index];
  if (!device?.deviceId || capabilityCache[device.deviceId] !== undefined) {
    return;
  }

  const payload = deviceRequestPayload(device);
  if (!payload.model || !payload.username || !payload.password) {
    return;
  }

  try {
    const response = await window.homebridge.request('/device-capabilities', payload);
    const modes = response?.modes || null;
    capabilityCache[device.deviceId] = modes;
    // A null answer means "unknown", which renders every field — exactly what is already
    // on screen, so there is nothing to redraw.
    if (modes && editingState[type] === index) {
      renderDeviceListPreservingFocus(type);
    }
  } catch {
    capabilityCache[device.deviceId] = null;
  }
}

function cancelEdit(type) {
  delete editingState[type];
  delete advancedOpen[type];
  delete activeTab[type];
  scenePickerTarget = null;
  renderDeviceList(type);
}

function removeScene(type, index, sceneIndex) {
  const device = pluginConfig[type]?.[index];
  if (!device?.scenes) {
    return;
  }
  device.scenes.splice(sceneIndex, 1);
  if (device.scenes.length === 0) {
    delete device.scenes;
  }
  refreshSceneSelection(type, index);
}

function clearScenes(type, index) {
  const device = pluginConfig[type]?.[index];
  if (!device?.scenes) {
    return;
  }
  delete device.scenes;
  refreshSceneSelection(type, index);
}

// ── Scene picker ───────────────────────────────────────────────────────────

/** Which device the open picker is editing. */
let scenePickerTarget = null;

/**
 * Credentials as currently typed in the Settings tab. The picker needs them to reach
 * Govee; without them it falls back to the bundled catalogue.
 */
function currentCredentials() {
  return {
    username: document.getElementById('username').value.trim(),
    password: document.getElementById('password').value,
    code: document.getElementById('code').value.trim() || undefined,
  };
}

/** Everything the content endpoints need to identify one device. */
function deviceRequestPayload(device) {
  const meta = deviceMeta[device.deviceId] || {};
  return {
    ...currentCredentials(),
    deviceId: device.deviceId,
    model: meta.model || device.model || '',
    goodsType: meta.goodsType,
    pactType: meta.pactType,
    pactCode: meta.pactCode,
    versionSoft: meta.versionSoft,
    versionHard: meta.versionHard,
  };
}

/**
 * Fill the picker section of the Scene Library tab.
 *
 * Loading is lazy and happens in place: nothing is fetched until the tab is actually
 * opened, and a second visit to the tab reuses what is already rendered rather than
 * hitting Govee again — `data-loaded-for` records which device the grid belongs to.
 */
async function loadScenePicker(type, index) {
  const device = pluginConfig[type]?.[index];
  const body = document.getElementById('scenePickerBody');
  if (!body || !device) {
    return;
  }

  scenePickerTarget = { type, index };

  // Already showing this device's library; just re-mark which tiles are selected.
  if (body.dataset.loadedFor && body.dataset.loadedFor === device.deviceId) {
    refreshScenePickerSelection();
    return;
  }

  const status = document.getElementById('scenePickerStatus');
  status.innerHTML = '';

  if (!device.deviceId) {
    body.innerHTML = '<div class="alert alert-secondary mb-0">Enter the device ID on the General tab '
      + 'and its scenes will appear here.</div>';
    return;
  }

  const payload = deviceRequestPayload(device);
  if (!payload.model) {
    body.innerHTML = '<div class="alert alert-warning mb-0">This device\'s model is unknown. '
      + 'Run <strong>Discover Devices</strong> first so the plugin knows which scenes to offer.</div>';
    return;
  }

  body.innerHTML = '<div class="text-center py-4"><span class="spinner-border" role="status"></span></div>';

  try {
    let library = sceneLibraryCache[device.deviceId];
    if (!library) {
      library = await window.homebridge.request('/scenes', payload);
      // Never cache the bundled fallback: entering credentials afterwards has to be able
      // to reach the full device-specific list without a page reload.
      if (library?.source !== 'offline') {
        sceneLibraryCache[device.deviceId] = library;
      }
    }

    // DIY effects are cloud-only, so a failure here is not fatal to the picker.
    let diys = [];
    try {
      const diyResponse = await window.homebridge.request('/diys', payload);
      diys = diyResponse?.diys || [];
    } catch {
      diys = [];
    }

    // The tab may have been closed while the request was in flight.
    if (!document.getElementById('scenePickerBody')) {
      return;
    }
    renderScenePicker(library, diys);
    body.dataset.loadedFor = device.deviceId;
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(err.message || 'Could not load scenes')}</div>`;
  }
}

function renderScenePicker(library, diys) {
  const body = document.getElementById('scenePickerBody');
  const status = document.getElementById('scenePickerStatus');

  const notes = [];
  if (library.source === 'offline') {
    notes.push('Showing the scene list bundled with the plugin. Log in and rediscover for the full, device-specific list.');
  }
  if (library.warning) {
    notes.push(library.warning);
  }
  status.innerHTML = notes.length
    ? `<div class="alert alert-info py-2 mb-2 small">${notes.map(escapeHtml).join('<br>')}</div>`
    : '';

  const groups = library.categories.map(category => ({
    id: `cat-${category.id}`,
    name: category.name,
    items: category.scenes.map(scene => ({
      key: `scene:${scene.sceneId}`,
      name: scene.name,
      iconUrl: scene.iconUrl,
      iconUrlDark: scene.iconUrlDark,
      payload: {
        name: scene.name,
        sceneCode: scene.code,
        sceneId: scene.sceneId,
        variantId: scene.variants[0]?.id,
        iconUrl: scene.iconUrl,
        iconUrlDark: scene.iconUrlDark,
        kind: 'scene',
      },
      variants: scene.variants,
    })),
  }));

  if (diys.length > 0) {
    groups.push({
      id: 'cat-diy',
      name: 'My DIY',
      items: diys.map(diy => ({
        key: `diy:${diy.diyId}`,
        name: diy.name,
        iconUrl: diy.iconUrl,
        payload: {
          name: diy.name,
          sceneCode: diy.code,
          sceneId: diy.diyId,
          iconUrl: diy.iconUrl,
          kind: 'diy',
        },
        variants: [],
      })),
    });
  }

  if (groups.length === 0) {
    body.innerHTML = '<div class="alert alert-warning mb-0">Govee returned no scenes for this device.</div>';
    return;
  }

  // Stash the item payloads so the click handler can look them up by key without
  // round-tripping them through the DOM.
  scenePickerItems = {};
  for (const group of groups) {
    for (const item of group.items) {
      scenePickerItems[item.key] = item;
    }
  }

  const tabs = groups.map((group, i) => `
    <li class="nav-item" role="presentation">
      <button class="nav-link ${i === 0 ? 'active' : ''}" data-bs-toggle="tab"
        data-bs-target="#${group.id}" type="button" title="${escapeHtml(group.name)}">
        <span class="gv-scene-cat-name">${escapeHtml(group.name)}</span>
        <span class="gv-scene-cat-count">${group.items.length}</span>
      </button>
    </li>`).join('');

  const panes = groups.map((group, i) => `
    <div class="tab-pane fade ${i === 0 ? 'show active' : ''}" id="${group.id}">
      <div class="gv-scene-grid">
        ${group.items.map(item => `
          <button type="button" class="gv-scene-tile" data-scene-key="${escapeHtml(item.key)}">
            ${sceneIconMarkup(item, 'gv-scene-icon-lg')}
            <span class="gv-scene-tile-name">${escapeHtml(item.name)}</span>
            ${item.variants.length > 1 ? `<span class="badge bg-secondary gv-scene-variants">${item.variants.length}</span>` : ''}
          </button>`).join('')}
      </div>
    </div>`).join('');

  // Categories run down the side rather than across the top: the names are long ("House
  // of the Dragon") and a horizontal strip had to scroll sideways to reach the later ones.
  body.innerHTML = `
    <div class="gv-scene-picker">
      <ul class="nav nav-pills gv-scene-cats" role="tablist">${tabs}</ul>
      <div class="tab-content gv-scene-panes">${panes}</div>
    </div>`;

  body.querySelectorAll('.gv-scene-tile').forEach(tile => {
    tile.addEventListener('click', () => toggleSceneSelection(tile.dataset.sceneKey));
  });

  refreshScenePickerSelection();
  hydrateSceneIcons(body);

  // Tiles in a hidden tab have zero size, so the observer never fires for them;
  // hydrate again whenever a tab is revealed.
  body.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
    tab.addEventListener('shown.bs.tab', () => hydrateSceneIcons(body));
  });
}

let scenePickerItems = {};

/** Key used to match a picked scene back to its tile. */
function selectionKey(scene) {
  return `${scene.kind || 'scene'}:${scene.sceneId}`;
}

function toggleSceneSelection(key) {
  const item = scenePickerItems[key];
  if (!item || !scenePickerTarget) {
    return;
  }
  const device = pluginConfig[scenePickerTarget.type]?.[scenePickerTarget.index];
  if (!device) {
    return;
  }
  if (!Array.isArray(device.scenes)) {
    device.scenes = [];
  }

  const existing = device.scenes.findIndex(scene => selectionKey(scene) === key);
  if (existing >= 0) {
    device.scenes.splice(existing, 1);
    if (device.scenes.length === 0) {
      delete device.scenes;
    }
  } else {
    device.scenes.push({ ...item.payload });
  }

  refreshSceneSelection(scenePickerTarget.type, scenePickerTarget.index);
}

/**
 * Reflect a selection change in both halves of the tab, without re-rendering the card.
 * A full re-render would rebuild the grid and lose the open category and scroll position
 * mid-click, which makes picking several scenes in a row unpleasant.
 */
function refreshSceneSelection(type, index) {
  const panel = document.getElementById('selectedScenesPanel');
  if (!panel) {
    // The tab is not on screen (a stale handler); fall back to a full redraw.
    renderDeviceList(type);
    return;
  }
  panel.innerHTML = renderSelectedScenes(type, index, pluginConfig[type]?.[index]?.scenes);
  hydrateSceneIcons(panel);
  refreshScenePickerSelection();
}

function refreshScenePickerSelection() {
  const device = pluginConfig[scenePickerTarget?.type]?.[scenePickerTarget?.index];
  const selected = new Set((device?.scenes || []).map(selectionKey));

  document.querySelectorAll('#scenePickerBody .gv-scene-tile').forEach(tile => {
    tile.classList.toggle('selected', selected.has(tile.dataset.sceneKey));
  });

  const count = selected.size;
  const countEl = document.getElementById('scenePickerCount');
  const warning = document.getElementById('scenePickerWarning');
  if (!countEl || !warning) {
    // The tab was swapped out while a request was in flight.
    return;
  }
  countEl.textContent = count === 1 ? '1 scene selected' : `${count} scenes selected`;

  // HomeKit refuses to publish an accessory with too many services; warn well before
  // the user hits that wall rather than letting the bridge fail to start.
  warning.classList.toggle('d-none', count <= 50);
  warning.textContent = count > 50
    ? `${count} scenes means ${count} HomeKit switches on this accessory. Much beyond this and HomeKit may refuse to add it — consider trimming the list.`
    : '';
}

(async () => {
  // Get the homebridge object
  const homebridge = window.homebridge;
  if (!homebridge) {
    console.error('Homebridge UI utils not available');
    return;
  }

  // Confirm theme via getUserSettings
  try {
    const settings = await homebridge.getUserSettings();
    const scheme = settings.colorScheme;
    if (scheme === 'dark' || scheme === 'light') {
      document.documentElement.dataset.bsTheme = scheme;
    } else if (scheme === 'auto') {
      document.documentElement.dataset.bsTheme =
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch {
    // getUserSettings not available in older versions
  }

  // Initialize Bootstrap tooltips
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));

  // Field mappings
  const textFields = ['username', 'password', 'code'];
  const numberFields = ['httpRefreshTime', 'lanRefreshTime', 'lanScanInterval', 'bleRefreshTime', 'bleControlInterval'];
  const booleanFields = ['ignoreMatter', 'disableDeviceLogging', 'colourSafeMode', 'awsDisable', 'lanDisable', 'bleDisable'];

  // Load configuration
  const loadConfig = async () => {
    try {
      const config = await homebridge.getPluginConfig();
      pluginConfig = config[0] || { platform: 'Govee', name: 'Govee' };

      // Load text fields
      textFields.forEach(field => {
        const el = document.getElementById(field);
        if (el) {
          el.value = pluginConfig[field] || '';
        }
      });

      // Load number fields
      numberFields.forEach(field => {
        const el = document.getElementById(field);
        if (el && pluginConfig[field] !== undefined) {
          el.value = pluginConfig[field];
        }
      });

      // Load boolean fields
      booleanFields.forEach(field => {
        const el = document.getElementById(field);
        if (el) {
          el.checked = pluginConfig[field] || false;
        }
      });

      // Auto-populate devices from cached discovery (from plugin startup)
      await loadCachedDevices();

      // Render device lists
      Object.keys(deviceTypes).forEach(type => renderDeviceList(type));

    } catch (err) {
      console.error('Failed to load config:', err);
      homebridge.toast.error('Failed to load configuration');
    }
  };

  // Load cached devices from plugin storage and add them to config if not already present
  const loadCachedDevices = async () => {
    try {
      const response = await homebridge.request('/get-cached-devices');
      const cachedDevices = response.devices || [];

      if (cachedDevices.length === 0) {
        return;
      }

      let addedCount = 0;

      for (const device of cachedDevices) {
        const deviceId = device.deviceId;
        const deviceName = device.deviceName || 'Unknown';
        const deviceType = device.deviceType || getDeviceTypeFromModel(device.model);

        if (!deviceId) {
          continue;
        }

        // Remember Govee's identifiers — the scene endpoints need them and they are
        // deliberately not written into the plugin config
        deviceMeta[deviceId] = {
          model: device.model,
          goodsType: device.goodsType,
          pactType: device.pactType,
          pactCode: device.pactCode,
          versionSoft: device.versionSoft,
          versionHard: device.versionHard,
        };

        // Initialize array if needed
        if (!pluginConfig[deviceType]) {
          pluginConfig[deviceType] = [];
        }

        // Check if device already exists in config
        const existing = pluginConfig[deviceType].find(d => d.deviceId === deviceId);

        if (!existing) {
          // Add device with name as label, pre-filling the LAN IP when known
          const entry = {
            deviceId: deviceId,
            label: deviceName,
          };
          if (device.ip && deviceType === 'lightDevices') {
            entry.customIPAddress = device.ip;
          }
          pluginConfig[deviceType].push(entry);
          addedCount++;
        } else if (device.ip && deviceType === 'lightDevices' && !existing.customIPAddress) {
          // Fill in the discovered LAN IP on existing entries that don't have one set
          existing.customIPAddress = device.ip;
        }
      }

      if (addedCount > 0) {
        console.log(`Auto-added ${addedCount} cached device(s) to configuration`);
      }
    } catch (err) {
      // Silently fail - cached devices are optional
      console.debug('No cached devices available:', err.message);
    }
  };

  // Save configuration
  const saveConfig = async () => {
    const saveBtn = document.getElementById('saveBtn');
    const saveSpinner = document.getElementById('saveSpinner');

    saveSpinner.classList.remove('d-none');
    saveBtn.disabled = true;

    try {
      // Save text fields
      textFields.forEach(field => {
        const el = document.getElementById(field);
        if (el) {
          const value = el.value.trim();
          if (value) {
            pluginConfig[field] = value;
          } else {
            delete pluginConfig[field];
          }
        }
      });

      // Save number fields
      numberFields.forEach(field => {
        const el = document.getElementById(field);
        if (el) {
          const value = parseInt(el.value, 10);
          if (!isNaN(value)) {
            pluginConfig[field] = value;
          }
        }
      });

      // Save boolean fields
      booleanFields.forEach(field => {
        const el = document.getElementById(field);
        if (el) {
          pluginConfig[field] = el.checked;
        }
      });

      // Clean up empty device arrays
      Object.keys(deviceTypes).forEach(type => {
        if (pluginConfig[type] && pluginConfig[type].length === 0) {
          delete pluginConfig[type];
        }
      });

      // Update config
      await homebridge.updatePluginConfig([pluginConfig]);
      await homebridge.savePluginConfig();

      homebridge.toast.success('Configuration saved successfully!');
    } catch (err) {
      console.error('Failed to save config:', err);
      homebridge.toast.error('Failed to save configuration: ' + err.message);
    } finally {
      saveSpinner.classList.add('d-none');
      saveBtn.disabled = false;
    }
  };

  // Load config on page load
  await loadConfig();

  // Toggle password visibility
  document.getElementById('togglePassword').addEventListener('click', () => {
    const passwordField = document.getElementById('password');
    const toggleBtn = document.getElementById('togglePassword');
    if (passwordField.type === 'password') {
      passwordField.type = 'text';
      toggleBtn.textContent = 'Hide';
    } else {
      passwordField.type = 'password';
      toggleBtn.textContent = 'Show';
    }
  });

  // Save button
  document.getElementById('saveBtn').addEventListener('click', saveConfig);

  // Test login button
  document.getElementById('testLoginBtn').addEventListener('click', async () => {
    const btn = document.getElementById('testLoginBtn');
    const spinner = document.getElementById('testLoginSpinner');
    const loginResult = document.getElementById('loginResult');

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const code = document.getElementById('code').value.trim();

    if (!username || !password) {
      homebridge.toast.warning('Please enter your credentials first.');
      loginResult.innerHTML = '<div class="alert alert-warning">Please enter your username and password in the Settings tab.</div>';
      return;
    }

    spinner.classList.remove('d-none');
    btn.disabled = true;
    loginResult.innerHTML = '';

    try {
      const response = await homebridge.request('/test-login', {
        username: username,
        password: password,
        code: code || undefined,
      });

      if (response.success) {
        homebridge.toast.success('Connection successful!');
        loginResult.innerHTML = `<div class="alert alert-success">${escapeHtml(response.message)}</div>`;
      } else if (response.twoFactorRequired) {
        // Govee just emailed a one-time code. Surface it as an actionable prompt
        // and focus the code field rather than showing a failure.
        homebridge.toast.info('Verification code sent to your email.');
        loginResult.innerHTML = `<div class="alert alert-info">${escapeHtml(response.message)}</div>`;
        document.getElementById('code').focus();
      } else {
        homebridge.toast.warning(response.message || 'Connection failed');
        loginResult.innerHTML = `<div class="alert alert-warning">${escapeHtml(response.message || 'Connection failed')}</div>`;
        if (response.twoFactorInvalid) {
          document.getElementById('code').focus();
        }
      }
    } catch (err) {
      homebridge.toast.error(err.message || 'Connection failed');
      loginResult.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || 'Connection failed')}</div>`;
    } finally {
      spinner.classList.add('d-none');
      btn.disabled = false;
    }
  });

  // Discover devices button
  document.getElementById('discoverBtn').addEventListener('click', async () => {
    const btn = document.getElementById('discoverBtn');
    const spinner = document.getElementById('discoverSpinner');
    const deviceList = document.getElementById('deviceList');

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const code = document.getElementById('code').value.trim();

    if (!username || !password) {
      homebridge.toast.warning('Please enter your credentials first.');
      deviceList.innerHTML = '<div class="alert alert-warning">Please enter your username and password in the Settings tab.</div>';
      return;
    }

    spinner.classList.remove('d-none');
    btn.disabled = true;
    deviceList.innerHTML = '';

    try {
      const response = await homebridge.request('/discover', {
        username: username,
        password: password,
        code: code || undefined,
      });
      const devices = response.devices || [];

      if (devices.length === 0) {
        homebridge.toast.info('No devices found.');
        deviceList.innerHTML = '<div class="alert alert-info">No devices found.</div>';
      } else {
        // Auto-add discovered devices to configuration
        let addedCount = 0;
        let skippedCount = 0;
        const addedByType = {};

        for (const device of devices) {
          const deviceId = device.device || device.deviceId || '';
          const deviceName = device.deviceName || 'Unknown';
          const model = device.sku || device.model || '';

          if (!deviceId) {
            continue;
          }

          deviceMeta[deviceId] = {
            model,
            goodsType: device.goodsType,
            pactType: device.pactType,
            pactCode: device.pactCode,
            versionSoft: device.versionSoft,
            versionHard: device.versionHard,
          };

          // Determine device type from model
          const deviceType = getDeviceTypeFromModel(model);

          // Initialize array if needed
          if (!pluginConfig[deviceType]) {
            pluginConfig[deviceType] = [];
          }

          // Check if device already exists in config
          const exists = pluginConfig[deviceType].some(d => d.deviceId === deviceId);

          if (!exists) {
            // Add device with name as label
            pluginConfig[deviceType].push({
              deviceId: deviceId,
              label: deviceName,
            });
            addedCount++;
            addedByType[deviceType] = (addedByType[deviceType] || 0) + 1;
          } else {
            skippedCount++;
          }
        }

        // Re-render all device lists
        Object.keys(deviceTypes).forEach(type => renderDeviceList(type));

        // Build summary message
        let summaryHtml = '';
        if (addedCount > 0) {
          summaryHtml += `<div class="alert alert-success mb-2">
            <strong>Added ${addedCount} new device(s):</strong><br>`;
          for (const [type, count] of Object.entries(addedByType)) {
            const typeName = type.replace('Devices', '').replace(/([A-Z])/g, ' $1').trim();
            summaryHtml += `${count} ${typeName} device(s)<br>`;
          }
          summaryHtml += '</div>';
        }
        if (skippedCount > 0) {
          summaryHtml += `<div class="alert alert-info mb-2">${skippedCount} device(s) already in configuration.</div>`;
        }

        // Show device list
        let html = summaryHtml + '<ul class="list-group">';
        for (const device of devices) {
          const deviceId = device.device || device.deviceId || '';
          const model = device.sku || device.model || '';
          const deviceType = getDeviceTypeFromModel(model);
          const typeName = deviceType.replace('Devices', '');

          html += `<li class="list-group-item d-flex justify-content-between align-items-center">
            <div>
              <strong>${escapeHtml(device.deviceName || 'Unknown')}</strong><br>
              <small class="text-muted">Model: ${escapeHtml(model || 'Unknown')}</small>
              <span class="badge bg-primary ms-2">${escapeHtml(typeName)}</span>
            </div>
            <div class="text-end">
              <code class="user-select-all">${escapeHtml(deviceId)}</code>
            </div>
          </li>`;
        }
        html += '</ul>';
        deviceList.innerHTML = html;

        if (addedCount > 0) {
          homebridge.toast.success(`Added ${addedCount} device(s). Click "Save Configuration" to persist.`);

          // Switch to Devices tab (accordion sections auto-expand via renderDeviceList)
          const devicesTab = document.getElementById('devices-tab');
          if (devicesTab) {
            new bootstrap.Tab(devicesTab).show();
          }
        } else {
          homebridge.toast.info(`Found ${devices.length} device(s). All already configured.`);
        }
      }
    } catch (err) {
      homebridge.toast.error(err.message || 'Discovery failed');
      deviceList.innerHTML = `<div class="alert alert-danger">Error: ${escapeHtml(err.message || 'Unknown error')}</div>`;
    } finally {
      spinner.classList.add('d-none');
      btn.disabled = false;
    }
  });

  // Helper function to show confirmation modal
  const showConfirm = (title, message) => {
    return new Promise((resolve) => {
      const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
      document.getElementById('confirmModalLabel').textContent = title;
      document.getElementById('confirmModalBody').textContent = message;

      const confirmBtn = document.getElementById('confirmModalBtn');
      const modalEl = document.getElementById('confirmModal');

      // Clean up previous listeners by cloning the button
      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

      let resolved = false;

      newConfirmBtn.addEventListener('click', () => {
        resolved = true;
        modal.hide();
        resolve(true);
      });

      modalEl.addEventListener('hidden.bs.modal', () => {
        if (!resolved) {
          resolve(false);
        }
      }, { once: true });

      modal.show();
    });
  };

  // Clear cache button
  document.getElementById('clearCacheBtn').addEventListener('click', async () => {
    const btn = document.getElementById('clearCacheBtn');
    const spinner = document.getElementById('clearCacheSpinner');
    const resultDiv = document.getElementById('clearCacheResult');

    // Confirm action using Bootstrap modal
    const confirmed = await showConfirm(
      'Clear Cache',
      'Are you sure you want to clear the cache? This will remove cached credentials and device data. You will need to restart Homebridge after clearing.',
    );

    if (!confirmed) {
      return;
    }

    spinner.classList.remove('d-none');
    btn.disabled = true;
    resultDiv.innerHTML = '';

    try {
      const response = await homebridge.request('/clear-cache');

      if (response.success) {
        homebridge.toast.success('Cache cleared successfully!');
        resultDiv.innerHTML = `<div class="alert alert-success">${escapeHtml(response.message)}</div>`;
      } else {
        homebridge.toast.warning(response.message || 'Cache partially cleared');
        resultDiv.innerHTML = `<div class="alert alert-warning">${escapeHtml(response.message || 'Cache partially cleared')}</div>`;
      }
    } catch (err) {
      homebridge.toast.error(err.message || 'Failed to clear cache');
      resultDiv.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || 'Failed to clear cache')}</div>`;
    } finally {
      spinner.classList.add('d-none');
      btn.disabled = false;
    }
  });

  // Make functions globally available
  window.addDevice = addDevice;
  window.removeDevice = removeDevice;
  window.editDevice = editDevice;
  window.cancelEdit = cancelEdit;
  window.removeScene = removeScene;
  window.clearScenes = clearScenes;
})();
