# CLAUDE.md

## Project Overview

Homebridge plugin (`@mp-consulting/homebridge-govee`) that integrates Govee smart home devices into Apple HomeKit via Homebridge. Supports lights, switches, outlets, sensors, fans, heaters, humidifiers, purifiers, diffusers, kettles, and ice makers.

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022 target, NodeNext modules, ESM)
- **Runtime**: Node.js ^20.18.0 || ^22.10.0 || ^24.0.0
- **Platform**: Homebridge ^1.8.0 || ^2.0.0-beta
- **Linting**: ESLint 9 flat config with typescript-eslint
- **Testing**: Vitest (co-located `*.test.ts` files alongside source)

## Commands

- `npm run build` — Clean `dist/`, compile TypeScript, copy certs, generate UI models
- `npm run lint` — Lint with zero warnings allowed
- `npm run lint:fix` — Auto-fix lint issues
- `npm test` — Run unit tests with Vitest
- `npm run test:watch` — Run tests in watch mode
- `npm run watch` — Build, link, and run with nodemon (auto-recompiles on `src/` changes, launches homebridge from `test/hbConfig/`)

## Project Structure

```
src/
  index.ts              # Plugin entry point (registers platform)
  platform.ts           # GoveePlatform — main platform class (DynamicPlatformPlugin)
  settings.ts           # Platform name and plugin name constants
  types.ts              # Shared TypeScript interfaces and types
  catalog/              # Device catalog: model definitions, capabilities, command codes
  connection/           # Communication clients: AWS IoT, BLE, HTTP API, LAN
  device/               # Device handlers, one file per device type
    base.ts             # GoveeDeviceBase — abstract base class for all devices
    registry.ts         # Device handler registry (maps models → categories → handlers)
    index.ts            # Re-exports all device classes and registry functions
    service-factory.ts  # HomeKit service creation helpers
    template.ts         # Template/diagnostic device
  utils/                # Helpers: colour conversion, constants, language strings, custom characteristics
  fakegato/             # FakeGato (Eve history) type declarations
homebridge-ui/          # Custom Homebridge UI (vanilla JS/HTML/CSS, not compiled by TS)
  server.js             # UI server-side handler
  public/               # UI client-side assets
config.schema.json      # Homebridge plugin configuration schema
```

## Architecture Patterns

- **Connection layer**: Four independent clients (`AWSClient`, `BLEClient`, `HTTPClient`, `LANClient`) communicate with devices via different protocols. The platform orchestrates them.
- **Device registry**: Models are mapped to categories, categories to handler classes. `registry.ts` provides `createDeviceInstance()` which instantiates the correct handler.
- **Device handlers**: Each extends `GoveeDeviceBase` and implements `init()` and `externalUpdate()`. They register HomeKit services/characteristics in `init()`.
- **Catalog-driven**: Device capabilities (speeds, temperatures, commands) are defined declaratively in `src/catalog/` and consumed by device handlers.

## Code Style

- Single quotes, 2-space indent, Unix line endings, semicolons required
- Trailing commas in multiline (`always-multiline`)
- Curly braces always required (`curly: all`)
- Max line length: 160 chars (warning)
- `SwitchCase` indent: 0 (cases at same level as switch)
- Arrow callbacks preferred over function expressions
- Unused vars: error (except `_`-prefixed args/vars and caught errors)
- Object curly spacing: `{ like, this }`
- No use before define (except classes and enums)

## Adding a New Device

1. Create a new handler file in `src/device/` extending `GoveeDeviceBase`
2. Add model definitions to `src/catalog/devices.ts` with capabilities
3. Register the handler category in `src/device/registry.ts`
4. Export from `src/device/index.ts`
5. If it needs a new config section, update `config.schema.json` and `src/types.ts`

## Release Workflow

When making user-facing changes (features, bug fixes, device support, config changes):

1. **CHANGELOG.md** — Add an entry under the current version heading. Use the format:
   ```
   ## [x.y.z] - YYYY-MM-DD
   ### Added / Changed / Fixed / Removed
   - Description of change
   ```
2. **Version bump** — Increment the version in `package.json` following semver:
   - Patch (`x.y.Z`) for bug fixes, minor tweaks
   - Minor (`x.Y.0`) for new device support, new features
   - Major (`X.0.0`) for breaking config or API changes
3. **README.md** — Update if the change affects installation, configuration options, supported devices list, or prerequisites.

## Important Notes

- BLE support depends on optional native modules (`@stoprocent/noble`) — may not compile on all platforms
- The `src/connection/cert/` directory contains AWS IoT root CA cert and is copied to `dist/` at build time
- `homebridge-ui/` uses plain JavaScript (not TypeScript) — it is excluded from `tsconfig.json`
- `scripts/generate-ui-models.js` auto-generates `homebridge-ui/public/models.js` from the catalog at build time
- Unit tests use Vitest with co-located `*.test.ts` files; test files are excluded from the TypeScript build via `tsconfig.json`
