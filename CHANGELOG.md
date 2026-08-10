# Changelog

All notable changes to this project will be documented in this file.

## [1.4.1] - 2026-08-10

### Fixed

- **The Homebridge log showed `[Govee]` instead of `[Govee]`**: Homebridge derives a plugin's log prefix from `name` in its platform config, falling back to the plugin alias when that key is absent. `config.schema.json` declared a `name` property but never listed it in `layout`, so the settings form never rendered the field and never wrote its default into `config.json`. `name` is now the first control in the form and defaults to `Govee`.

## [1.4.0] - 2026-08-09

### Changed

- **The light editor is now three tabs — General, Scene Library and Music Mode.** A light carries three unrelated concerns, and stacking them in one scrolling form (as 1.3.0 did) meant the scene grid pushed everything else off screen. Advanced settings stay in a disclosure, now inside General. The open tab survives a re-render, so picking several scenes in a row no longer bounces you back to the top. Every other device type keeps the single stacked form — they are simple enough to read in one pass.
- **Every light setting now explains itself.** Each field carries a line of help describing what it actually does and when to touch it, instead of leaving the label to do all the work.
- **The scene picker is inline, not a dialog.** The Scene Library tab shows the current selection above and the library below it, both on screen at once, so a tile you toggle is seen landing in the selection. Toggling no longer rebuilds the grid, so the open category and scroll position survive. The modal is gone.
- **Scene categories run down the side** rather than across the top. Names like "House of the Dragon" no longer need a sideways-scrolling strip to reach, and each category shows how many scenes it holds.
- **Brightness Step is a slider** with a live percentage readout, rather than a bare number box.

### Fixed

- **Adaptive Lighting no longer hides an off switch inside a number.** The setting was a single number in which `-1` silently meant "disable Adaptive Lighting entirely" and anything else was a mired offset — impossible to guess from the UI. It is now a switch plus a **Warmth shift** slider that only appears when it is on. The stored config is unchanged, so existing values keep working, and turning it off and back on restores the shift you had rather than resetting it.
- **Long scene category names caused horizontal scrolling.** Two causes: `text-overflow: ellipsis` never engaged, because a flex child defaults to `min-width: auto` and so refuses to shrink below its text; and `overflow-y: auto` makes the browser compute `overflow-x` to `auto` as well, so the overflowing name produced a sideways scrollbar. Names are now truncated with the full text on hover.

## [1.3.1] - 2026-08-09

### Fixed

- **Config UI was blank and the scene picker could not open**: Bootstrap and Bootstrap Icons were loaded from `cdn.jsdelivr.net`, which the Homebridge UI's content-security policy refuses — the stylesheets and script were blocked, leaving `bootstrap` undefined, so the tabs did nothing and **Browse Govee Scenes** threw instead of opening. Both are now vendored into the plugin and served from it, alongside the icon font. This affected 1.2.x as well, where it broke the tab strip; 1.3.0 made it fatal, since the scene picker is a Bootstrap modal.

## [1.3.0] - 2026-08-09

### Added

- **Scene picker with icons in the config UI**: light devices gain a **Browse Govee Scenes** button that opens the scene library as a grid of tiles showing the same names and artwork as the Govee app. Picked scenes are stored in a new `scenes` array — one HomeKit switch each, with no cap — and keep their icon so the list stays recognisable when you return to it. Icons are fetched by the plugin's UI server and inlined as data URIs, because the config UI's content-security policy blocks Govee's CDN directly; only Govee image hosts are accepted, and tiles load lazily as they scroll into view.
- **Scene library fetched per device**: with Govee credentials configured, the plugin reads the scene library Govee publishes for the exact model (`/appsku/v2/scences`), applying Govee's per-model effect overrides. Scenes are encoded into the `0xA3` multi-packet frames plus the `0x33 05 04` activation frame that the Govee app itself writes, so no codes need to be sniffed or pasted by hand. Where a scene ships multiple effect variants, all of them are exposed.
- **DIY effects**: your own DIY effects are listed alongside the scenes, each with its cover image, and can be selected the same way.
- **Offline scene catalogue**: a trimmed copy of the catalogue bundled in the Govee app ships with the plugin, so the picker works before logging in and for Bluetooth-only or LAN-only setups. The picker states which source it used.
- **Live music mode**: a new **Music Mode Tile** option exposes music mode as its own HomeKit tile — on/off, brightness as microphone sensitivity, and hue/saturation as the music colour when auto-colour is off — instead of freezing one pasted code. Effect (Rhythm, Energic, Rolling, Spectrum), the soft rhythm variant, and the protocol generation are configurable; older lights that use the earlier music command are supported via **Music Protocol: Legacy**.
- **Capability-aware config**: the config UI asks Govee which modes a device actually supports (`/bff-app/v1/devices/detail/function-support`) and hides controls the hardware lacks. An unknown answer shows everything rather than hiding controls wrongly.
- **`goodsType` captured from discovery**: Govee's product-family id is now stored with the discovered device list, since the scene, DIY and capability endpoints all require it.

### Fixed

- **Multi-frame commands over Bluetooth**: a `ptReal` command spanning several frames — which every real scene and DIY effect does — previously wrote only its first frame, so the device never received the full effect. All frames are now written in order over a single connection.
- **`ptReal` over Bluetooth was double-encoded**: the platform converted the command from base64 to hex and the BLE client then decoded it as base64 again, producing meaningless bytes. The command is now passed through in the form the BLE client expects.

### Changed

- **Device editor is now a single scrolling form** instead of sub-tabs. The card already sits inside an accordion inside a page-level tab, and a further layer of tabs buried the settings — everything is now visible at once in stacked sections, with only the rarely-used Advanced block collapsed (and its open state remembered across re-renders).
- **Scene Library panel** heads the scene section: a live summary of what is selected, Browse and Clear buttons, and the chosen scenes as icon chips with DIY entries badged. The empty state explains that each scene becomes its own HomeKit switch.
- **Music effect is a segmented icon picker** rather than a dropdown (a native `<option>` cannot show an icon), and sensitivity is a slider with a live percentage readout.
- **Scene icons are fetched in batches.** Each proxied icon wrote a line to the Homebridge log, so opening a 150-scene library flooded it; visible icons are now coalesced into a single request per batch, cutting a full library from ~120 log lines to one or two.
- The scene picker dialog sizes itself against the plugin-settings iframe rather than the browser window, so it gets the full available width instead of Bootstrap's narrow fallback; long category names stay on one line in a horizontally scrolling strip.
- Scene switches are now removed from HomeKit when the corresponding scene is deleted from the config, instead of lingering as dead tiles.
- The existing fixed scene slots (`scene`, `sceneTwo`, `diyMode`, `musicMode`, `segmented`, `videoMode`, …) are unchanged and keep working; no existing configuration needs editing.

### Notes

- Scene, DIY and capability support uses the same unofficial endpoints as the Govee Home app. They can change without notice; every call falls back rather than failing the plugin.
- Scene speed and direction are deliberately not sent as commands. In the Govee app they are not separate commands at all — the effect payload itself is rewritten by per-model routines — so the plugin exposes Govee's own effect variants and the speed/direction metadata instead of guessing at bytes.

## [1.2.2] - 2026-08-09

### Changed

- **Node.js support is now `^22.10.0 || ^24.0.0 || ^26.0.0`**: adds Node 26, which Homebridge 2.3.0 supports as of this release, and drops Node 20. Homebridge 2.x has never accepted Node 20 (it has required `^22 || ^24` since 2.0.0), so the previous range advertised a combination that could not actually run. CI now builds on Node 22.x, 24.x and 26.x.

## [1.2.1] - 2026-07-25

### Fixed

- **`fs.existsSync` deprecation warning (DEP0187) at startup** (#8): the `aws-iot-device-sdk` dependency probes its optional `keyPath`/`certPath`/`caPath` options with `fs.existsSync()` even when they are unset, and passing `undefined` triggers a deprecation warning on Node 24+. The plugin passes its certificates as in-memory buffers, so these path options are never used — `existsSync` is now shielded for the duration of the (synchronous) SDK client construction.

## [1.2.0] - 2026-07-25

### Added

- **H5310 Pool Temperature Sensor support** (upstream issue homebridge-plugins/homebridge-govee#1271): the H5310 (connected via an H5044 WiFi gateway) is now recognised as a thermo-hygrometer sensor and reports temperature via the HTTP device-list sync. Govee's `65535` sentinel value ("no reading / sensor not fitted") is now filtered out for temperature, humidity, and PM2.5, so models without a humidity sensor (like the H5310) no longer report a bogus 100% humidity.
- **Device picker pre-fills LAN IP addresses** (upstream issue homebridge-plugins/homebridge-govee#1323): devices discovered on the local network now have their IP address stored alongside the cached device list, and the config UI pre-fills `customIPAddress` on light devices when auto-adding them (and fills it in on existing entries that have none). Useful for cross-VLAN setups where mDNS/multicast discovery is unreliable.

### Fixed

- **H5106 Air Quality Monitor showing 0° temperature** (upstream issues homebridge-plugins/homebridge-govee#1322, #1296): the H5106 relied solely on AWS push messages for readings, which can stop arriving or change format. Air quality monitors are now included in the periodic HTTP device-list sync and read temperature, humidity, and PM2.5 directly from `lastDeviceData`, with the same offset handling as thermo sensors.
- **Login no longer fails when Govee's community API is down** (upstream issue homebridge-plugins/homebridge-govee#1270): the secondary community-API login (which only provides the optional TTR token) was performed inline with the main login, so a community-API outage broke the whole plugin. It is now best-effort — a failure is logged at debug level and login continues without the token.

### Changed

- **H7142 humidifier diagnostics** (upstream issue homebridge-plugins/homebridge-govee#1294): unparsed humidity payload variants (opcode `1001` with a non-`00` check byte — the cause of "humidity stuck at 0%") and auto-mode reports (opcode `0503`, believed to carry the target humidity) are now logged at debug level so device owners can capture the payload formats needed to implement full support (water tank status, target humidity, auto-stop).

## [1.1.2] - 2026-07-25

### Fixed

- **Thermo-hygrometer and leak sensors never received data** (#8): WiFi thermo-hygrometer sensors (e.g. H5103) and leak sensors initialised but reported 0°C, 0% humidity, and a low-battery warning forever. The periodic HTTP device-list sync that delivers sensor readings (`deviceExt.lastDeviceData` temperature/humidity/online plus `deviceSettings` battery) was never ported from the upstream plugin — the `httpRefreshTime` config option was accepted but unused. The plugin now polls the Govee HTTP API every `httpRefreshTime` seconds (default 30) when any thermo or leak sensors are present and feeds the readings to HomeKit. Raw sensor payloads are logged at debug level to help diagnose unit discrepancies.

## [1.1.0] - 2026-07-05

### Added

- **New-device email verification (2FA) support** (#7): Govee now challenges logins from an unrecognised client with an emailed one-time code (returned as an HTTP 200 body with app-level status `454`). Previously this surfaced as an opaque login failure and no code was ever sent. The plugin now detects the `454` challenge, asks Govee to email a verification code, and surfaces an actionable message. Enter the code in the new **Verification Code** config field (or `code` in JSON) and log in again; the plugin uses a stable client id, so verification is a one-time step. The config UI "Test Connection" reveals and focuses the code field when a code has been sent.

### Changed

- **Login endpoint**: Migrated account login from `account/rest/account/v1/login` to `account/rest/account/v2/login`, which is what the current Govee app uses and what supports the verification-code flow. The app version/user-agent sent with account requests was bumped to match.

## [1.0.15] - 2026-06-17

### Fixed

- **Opaque "Login failed - no token received" error** (#7): When the Govee server returns HTTP 200 without the expected account-token shape (and without an error message), both the config UI "Test Connection" and the runtime login showed a generic "no token received" message with nothing to diagnose. The error now leads with any message the server did provide, and otherwise reports the HTTP status plus a truncated copy of the raw response body. It also notes that this cloud login is not required for Bluetooth- or LAN-only setups, so those devices keep working even when it fails. The runtime login additionally logs the raw response body at debug level.

## [1.0.14] - 2026-04-17

### Changed

- **Dependencies**: Updated all dependencies to latest compatible versions

## [1.0.13] - 2026-04-04

### Fixed

- **HomeKit**: Set TemperatureSensor as primary service so HomeKit tile shows temperature

### Changed

- **Node.js**: Add Node.js 24.x support to CI matrix and standardize engines to `^20.18.0 || ^22.10.0 || ^24.0.0`

## [1.0.12] - 2026-03-30

### Changed

- **Dependencies**: Add `class-validator` as a direct dependency for `homebridge-config-ui-x` compatibility
- **Node.js**: Standardize `.tool-versions` to Node 20.22.2

## [1.0.11] - 2026-03-30

### Fixed

- **HTTP Client**: Replace OpenSSL shell-out with `node-forge` for PFX certificate parsing, fixing RC2-40-CBC failures on OpenSSL 3+ (#5)

## [1.0.10] - 2026-03-30

### Changed

- **Govee API**: Updated app version to 6.8.01 and user agent to iOS 18.3.0 / Alamofire 5.10.2
- **Govee API**: Added required headers (appVersion, clientId, clientType, timestamp) to login request
- **Dependencies**: Updated all dependencies including major upgrades to ESLint 10, TypeScript 6, and @types/node 25

### Fixed

- **Lint**: Resolved `no-useless-assignment` errors introduced by ESLint 10

## [1.0.9] - 2026-03-26

### Changed

- **Dependencies**: Updated all dependencies to latest compatible versions

## [1.0.8] - 2026-03-05

### Changed

- **Config UI**: Migrated to `@mp-consulting/homebridge-ui-kit` design system (Bootstrap 5.3, Bootstrap Icons)
- **Config UI**: Replaced emoji icons with Bootstrap Icons throughout device accordion
- **Config UI**: Redesigned layout — 3 tabs (Devices, Settings, Tools) instead of 4; Settings and Connection tabs merged; Discover Devices moved to the top of the Devices tab
- **Config UI**: Device list now shows compact rows with Edit/Remove buttons; clicking Edit opens a 2-column form with Settings and Advanced tabs
- **Config UI**: Device accordion sections auto-expand when they have devices configured; count badge turns blue when non-zero
- **Config UI**: Connection settings (AWS IoT, LAN, BLE) displayed in a 3-column side-by-side layout
- **Config UI**: Added dark/light mode theme detection from system preference and Homebridge user settings
- **package.json**: Harmonized author, funding, engines, and scripts with other repos

## [1.0.7] - 2026-03-04

### Fixed

- **HTTP Client Certificate**: Fix PFX certificate extraction failing on Synology NAS and other systems without `/dev/stdin` by passing the file path directly to OpenSSL instead of piping through stdin

### Added

- **Tests**: Added tests for `pfxToCertAndKey` function

## [1.0.6] - 2026-03-03

### Fixed

- **BLE Refresh Time Config**: Aligned `config.schema.json` minimum (now 60) and default (now 300) for `bleRefreshTime` with the runtime-enforced values in constants, preventing the UI from accepting values the plugin would reject

## [1.0.5] - 2026-02-22

### Added

- **Unit Test Suite**: Added 215 tests across 10 test files using Vitest, covering color conversion, sensor decoding, device catalog, registry pipeline, speed calculations, and utility functions
- **CI Test Step**: Tests now run automatically in the CI pipeline alongside lint and build

### Changed

- **Platform Robustness**: Refactored platform internals for improved device lifecycle management and error handling
- **Connection Layer Hardening**: Improved AWS IoT, BLE, HTTP, and LAN clients with better retry logic, error handling, and connection state management
- **Device Handler Safety**: Added defensive null checks and graceful degradation across all device handlers
- **HTTP Client**: Replaced manual retry logic with robust queued request handling and proper error classification
- **BLE Client**: Improved scan lifecycle, connection cleanup, and error recovery

### Fixed

- **Security**: Addressed potential vulnerabilities in connection handling and input validation
- **UI Script**: Fixed curly brace lint violation in homebridge-ui script

## [1.0.4] - 2026-02-22

### Added

- **H802A Support**: Added Govee H802A LED Light Strip to the device compatibility catalog (#1)

## [1.0.2] - 2025-12-27

### Improved

- **BLE Error Message**: Improved the Bluetooth error message when running on systems without Bluetooth hardware (e.g., Synology NAS). Now displays a clear, user-friendly message instead of a technical error.

## [1.0.1] - 2025-12-27

### Changed

- **Centralized Device Catalog**: Moved all device command codes (Base64-encoded) from individual device handlers to a central catalog system (`src/catalog/`), improving maintainability and reducing code duplication.

- **Consolidated Purifier Handlers**: Merged the nearly identical H7126 and H7127 purifier implementations into a shared base class (`purifier-h7126-base.ts`), eliminating ~450 lines of duplicated code.

- **Added Debounce Constants**: Centralized timing constants for brightness, color, and color temperature updates to eliminate magic numbers across device handlers.

### Device Codes Centralized

The following device codes are now managed in the catalog:

- **Heater (H7130/H7131/H7132)**: Temperature codes, speed codes, swing codes, lock codes
- **Fan (H7102)**: Speed codes, swing codes
- **Humidifier (H7140/H7142)**: Speed codes, UV codes
- **Purifier (H7120-H7129)**: Speed codes, night light codes
- **Kettle (H7170/H7171)**: Mode codes (green tea, oolong, coffee, black tea, custom modes)
- **Ice Maker (H7172)**: Start/cancel codes
- **Dehumidifier (H7150/H7151)**: Speed codes (reusing humidifier codes)

### Technical Improvements

- Eliminated magic numbers for device speeds, temperatures, and timing delays
- Added type-safe exports with `as const` assertions for immutable code objects
- Improved code organization with clear separation between device logic and command codes
- Reduced maintenance burden when adding new device models

## [1.0.0] - 2025-12-27

### Added

- Initial release with support for Govee devices via AWS IoT, LAN, and BLE connections
- Device handlers for lights, switches, sensors, heaters, fans, humidifiers, purifiers, kettles, ice makers, and more
- Homebridge UI configuration interface
- FakeGato history support for sensors
