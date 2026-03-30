# Changelog

All notable changes to this project will be documented in this file.

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
