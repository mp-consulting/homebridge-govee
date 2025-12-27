// modelCategories and getDeviceTypeFromModel are loaded from models.js
// which is auto-generated from src/utils/constants.ts during build

// Device type configurations
const deviceTypes = {
  lightDevices: {
    fields: [
      { id: 'deviceId', label: 'Device ID', type: 'text', required: true },
      { id: 'label', label: 'Custom Label', type: 'text' },
      { id: 'ignoreDevice', label: 'Ignore Device', type: 'checkbox' },
      { id: 'showAs', label: 'Show As', type: 'select', options: [
        { value: 'default', label: 'Light (default)' },
        { value: 'switch', label: 'Switch' },
      ] },
      { id: 'customIPAddress', label: 'Custom IP Address', type: 'text', advanced: true },
      { id: 'customAddress', label: 'Custom BLE Address', type: 'text', advanced: true },
      { id: 'brightnessStep', label: 'Brightness Step', type: 'number', min: 1, max: 100, advanced: true },
      { id: 'adaptiveLightingShift', label: 'Adaptive Lighting Shift', type: 'number', advanced: true },
      { id: 'awsBrightnessNoScale', label: 'AWS Brightness No Scale', type: 'checkbox', advanced: true },
      { id: 'awsColourMode', label: 'AWS Colour Mode', type: 'select', advanced: true, options: [
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

function renderDeviceField(type, index, field, value) {
  const fieldId = `${type}_${index}_${field.id}`;
  let html = '';

  if (field.type === 'checkbox') {
    html = `
      <div class="form-check form-switch mb-2">
        <input class="form-check-input device-field" type="checkbox" id="${fieldId}"
          data-type="${type}" data-index="${index}" data-field="${field.id}"
          ${value ? 'checked' : ''}>
        <label class="form-check-label" for="${fieldId}">${field.label}</label>
      </div>`;
  } else if (field.type === 'select') {
    const options = field.options.map(opt =>
      `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`,
    ).join('');
    html = `
      <div class="mb-2">
        <label class="form-label" for="${fieldId}">${field.label}</label>
        <select class="form-select form-select-sm device-field" id="${fieldId}"
          data-type="${type}" data-index="${index}" data-field="${field.id}">
          ${options}
        </select>
      </div>`;
  } else {
    html = `
      <div class="mb-2">
        <label class="form-label" for="${fieldId}">${field.label}${field.required ? ' *' : ''}</label>
        <input type="${field.type}" class="form-control form-control-sm device-field" id="${fieldId}"
          data-type="${type}" data-index="${index}" data-field="${field.id}"
          value="${value || ''}" ${field.min !== undefined ? `min="${field.min}"` : ''}
          ${field.max !== undefined ? `max="${field.max}"` : ''}>
      </div>`;
  }
  return html;
}

function renderDevice(type, index, device) {
  const config = deviceTypes[type];
  const isIgnored = device.ignoreDevice;
  const displayName = device.label || device.deviceId || 'New Device';

  const basicFields = config.fields.filter(f => !f.advanced);
  const advancedFields = config.fields.filter(f => f.advanced);

  let fieldsHtml = basicFields.map(f => renderDeviceField(type, index, f, device[f.id])).join('');

  if (advancedFields.length > 0) {
    const advancedHtml = advancedFields.map(f => renderDeviceField(type, index, f, device[f.id])).join('');
    fieldsHtml += `
      <div class="mt-2">
        <a class="btn btn-link btn-sm p-0" data-bs-toggle="collapse" href="#${type}_${index}_advanced">
          Advanced Settings
        </a>
        <div class="collapse mt-2" id="${type}_${index}_advanced">
          ${advancedHtml}
        </div>
      </div>`;
  }

  return `
    <div class="card device-card mb-2 ${isIgnored ? 'ignored' : ''}" id="${type}_${index}_card">
      <div class="card-body py-2">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong>${displayName}</strong>
          <button class="btn btn-outline-danger btn-sm" onclick="removeDevice('${type}', ${index})">Remove</button>
        </div>
        ${fieldsHtml}
      </div>
    </div>`;
}

function renderDeviceList(type) {
  const devices = pluginConfig[type] || [];
  const container = document.getElementById(`${type}List`);
  const countBadge = document.getElementById(`${type}Count`);

  if (devices.length === 0) {
    container.innerHTML = '<p class="text-muted">No devices configured.</p>';
  } else {
    container.innerHTML = devices.map((device, index) => renderDevice(type, index, device)).join('');
  }

  countBadge.textContent = devices.length;

  // Add event listeners for field changes
  container.querySelectorAll('.device-field').forEach(field => {
    field.addEventListener('change', handleDeviceFieldChange);
    field.addEventListener('input', handleDeviceFieldChange);
  });
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

  if (field.type === 'checkbox') {
    pluginConfig[type][index][fieldName] = field.checked;
  } else if (field.type === 'number') {
    const val = parseInt(field.value);
    if (!isNaN(val)) {
      pluginConfig[type][index][fieldName] = val;
    }
  } else {
    const val = field.value.trim();
    if (val) {
      pluginConfig[type][index][fieldName] = val;
    } else {
      delete pluginConfig[type][index][fieldName];
    }
  }

  // Update card appearance if ignoreDevice changed
  if (fieldName === 'ignoreDevice') {
    const card = document.getElementById(`${type}_${index}_card`);
    if (card) {
      card.classList.toggle('ignored', field.checked);
    }
  }
}

function addDevice(type) {
  if (!pluginConfig[type]) {
    pluginConfig[type] = [];
  }
  pluginConfig[type].push({ deviceId: '' });
  renderDeviceList(type);
}

function removeDevice(type, index) {
  if (pluginConfig[type]) {
    pluginConfig[type].splice(index, 1);
    if (pluginConfig[type].length === 0) {
      delete pluginConfig[type];
    }
    renderDeviceList(type);
  }
}

(async () => {
  // Get the homebridge object
  const homebridge = window.homebridge;
  if (!homebridge) {
    console.error('Homebridge UI utils not available');
    return;
  }

  // Initialize Bootstrap tooltips
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));

  // Field mappings
  const textFields = ['username', 'password'];
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
      });

      if (response.success) {
        homebridge.toast.success('Connection successful!');
        loginResult.innerHTML = `<div class="alert alert-success">${response.message}</div>`;
      } else {
        homebridge.toast.warning(response.message || 'Connection failed');
        loginResult.innerHTML = `<div class="alert alert-warning">${response.message || 'Connection failed'}</div>`;
      }
    } catch (err) {
      homebridge.toast.error(err.message || 'Connection failed');
      loginResult.innerHTML = `<div class="alert alert-danger">${err.message || 'Connection failed'}</div>`;
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
              <strong>${device.deviceName || 'Unknown'}</strong><br>
              <small class="text-muted">Model: ${model || 'Unknown'}</small>
              <span class="badge bg-primary ms-2">${typeName}</span>
            </div>
            <div class="text-end">
              <code class="user-select-all">${deviceId}</code>
            </div>
          </li>`;
        }
        html += '</ul>';
        deviceList.innerHTML = html;

        if (addedCount > 0) {
          homebridge.toast.success(`Added ${addedCount} device(s). Click "Save Configuration" to persist.`);

          // Switch to Devices tab and expand first accordion with devices
          const devicesTab = document.getElementById('devices-tab');
          if (devicesTab) {
            const tab = new bootstrap.Tab(devicesTab);
            tab.show();

            // Expand the first accordion that has devices
            setTimeout(() => {
              for (const type of Object.keys(deviceTypes)) {
                if (pluginConfig[type] && pluginConfig[type].length > 0) {
                  const collapseEl = document.getElementById(`${type}Collapse`);
                  if (collapseEl) {
                    new bootstrap.Collapse(collapseEl, { toggle: true });
                    break;
                  }
                }
              }
            }, 100);
          }
        } else {
          homebridge.toast.info(`Found ${devices.length} device(s). All already configured.`);
        }
      }
    } catch (err) {
      homebridge.toast.error(err.message || 'Discovery failed');
      deviceList.innerHTML = `<div class="alert alert-danger">Error: ${err.message || 'Unknown error'}</div>`;
    } finally {
      spinner.classList.add('d-none');
      btn.disabled = false;
    }
  });

  // Clear cache button
  document.getElementById('clearCacheBtn').addEventListener('click', async () => {
    const btn = document.getElementById('clearCacheBtn');
    const spinner = document.getElementById('clearCacheSpinner');
    const resultDiv = document.getElementById('clearCacheResult');

    // Confirm action using Homebridge modal (native confirm() doesn't work in iframe)
    const confirmed = await homebridge.showConfirmModal(
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
        resultDiv.innerHTML = `<div class="alert alert-success">${response.message}</div>`;
      } else {
        homebridge.toast.warning(response.message || 'Cache partially cleared');
        resultDiv.innerHTML = `<div class="alert alert-warning">${response.message || 'Cache partially cleared'}</div>`;
      }
    } catch (err) {
      homebridge.toast.error(err.message || 'Failed to clear cache');
      resultDiv.innerHTML = `<div class="alert alert-danger">${err.message || 'Failed to clear cache'}</div>`;
    } finally {
      spinner.classList.add('d-none');
      btn.disabled = false;
    }
  });

  // Make functions globally available
  window.addDevice = addDevice;
  window.removeDevice = removeDevice;
})();
