# CLAUDE.md

## Project Overview

Homebridge plugin (`@mp-consulting/homebridge-govee`) that integrates Govee smart home devices into Apple HomeKit via Homebridge. Supports lights, switches, outlets, sensors, fans, heaters, humidifiers, purifiers, diffusers, kettles, and ice makers.

## Tech Stack

- **Language**: TypeScript 6 (strict mode, ES2022 target, NodeNext modules, ESM)
- **Runtime**: Node.js ^22.10.0 || ^24.0.0 || ^26.0.0
- **Platform**: Homebridge ^1.8.0 || ^2.0.0-beta
- **Linting**: ESLint 10 flat config with typescript-eslint; `knip` for unused files/exports/dependencies
- **Testing**: Vitest 5, tests under `test/` mirroring `src/`, with coverage thresholds

## Commands

- `npm run build` — Clean `dist/`, compile TypeScript, copy certs, generate UI models
- `npm run lint` — Lint with zero warnings allowed
- `npm run lint:fix` — Auto-fix lint issues
- `npm run typecheck` — Type check `src/` and `test/` (tests are type checked via `tsconfig.test.json`)
- `npm run knip` — Report unused files, exports and dependencies (CI fails on findings)
- `npm test` — Run unit tests with Vitest
- `npm run test:coverage` — Run tests with coverage; thresholds in `vitest.config.mts` are a ratchet (raise, never lower)
- `npm run test:watch` — Run tests in watch mode
- `npm run watch` — Build, link, and run with nodemon (auto-recompiles on `src/` changes, launches homebridge from `test/hbConfig/`)

## Project Structure

```
src/
  index.ts              # Plugin entry point (registers platform)
  platform.ts           # GoveePlatform — main platform class (DynamicPlatformPlugin)
  settings.ts           # Platform name and plugin name constants
  types.ts              # Shared TypeScript interfaces and types
  catalog/              # Command codes per device family (base64 frames, speed/temperature tables)
  connection/           # Communication clients: AWS IoT, BLE, HTTP API, LAN
    commands.ts         # Encodes a DeviceCommand for each transport (AWS/BLE/LAN)
    credentials.ts      # Persists the account token and AWS IoT certificate
  device/               # Device handlers, one file per device type
    base.ts             # GoveeDeviceBase — abstract base class for all devices
    registry.ts         # Maps models → categories → handlers; resolveCategory() applies showAs and other config overrides
    index.ts            # Registers every handler (initializeDeviceHandlers)
    multi-channel.ts    # Double/triple outlets and switches (stateDual bitmask)
    template.ts         # Template/diagnostic device
  utils/                # Helpers: colour conversion, constants (model lists), language strings, custom characteristics
    device-types.ts     # Model → config array mapping (single source; the UI gets a generated copy)
    device-update.ts    # Normalises AWS/LAN/BLE/HTTP status payloads for handlers
  fakegato/             # FakeGato (Eve history) type declarations
homebridge-ui/          # Custom Homebridge UI (vanilla JS/HTML/CSS, not compiled by TS)
  server.js             # UI server-side handler
  public/               # UI client-side assets
config.schema.json      # Homebridge plugin configuration schema
```

## Architecture Patterns

- **Connection layer**: Four independent clients (`AWSClient`, `BLEClient`, `HTTPClient`, `LANClient`) communicate with devices via different protocols. The platform sends commands over LAN, then AWS, then BLE (queued, one at a time; a newer command of the same kind replaces a queued one).
- **Status updates**: every incoming status goes through `normaliseDeviceUpdate()` before reaching a handler's `externalUpdate()`. Opcode updates arrive as base64 frames in `commands`; handlers decode them with `processCommands()`, keyed by opcode + sub-code (`'0501'`) or opcode alone (`'05'`).
- **Device registry**: Models are mapped to categories, categories to handler classes. `registry.ts` provides `createDeviceInstance()` which instantiates the correct handler.
- **Device handlers**: Each extends `GoveeDeviceBase` and implements `init()` and `externalUpdate()`. They register HomeKit services/characteristics in `init()`. Model variants extend a sibling rather than copying it (e.g. `Heater1bDevice extends Heater1aDevice`, `HumidifierH7142Device extends HumidifierH7160Device`, `PurifierAirQualityBase`). Use `this.schedule()` instead of `setTimeout` so timers are cleared on `destroy()`.
- **Command codes**: base64 command frames live in `src/catalog/commands.ts`; model lists live in `src/utils/constants.ts`.
- **Custom UI**: Uses Homebridge custom UI framework (`homebridge-ui/`) for plugin configuration management

## Code Style

- Single quotes, 2-space indent, Unix line endings, semicolons required
- Trailing commas in multiline (`always-multiline`)
- Curly braces always required (`curly: all`)
- Max line length: 160 chars (warning)
- `SwitchCase` indent: 1 (cases indented one level inside switch)
- Arrow callbacks preferred over function expressions
- Unused vars: error (except `_`-prefixed args/vars and caught errors)
- Object curly spacing: `{ like, this }`
- No use before define (except classes and enums)

## Adding a New Device

1. Add the model to the right list in `src/utils/constants.ts` (`platformConsts.models`). That also decides its config array (`src/utils/device-types.ts`) and the config UI's mapping.
2. If it needs its own handler, create it in `src/device/` extending `GoveeDeviceBase` (or the closest existing sibling), with command codes in `src/catalog/commands.ts`
3. Register it in `initializeDeviceHandlers()` in `src/device/index.ts` (`registerDeviceHandler` for a category, `registerModelHandler` for one model)
4. If it needs new settings, update `config.schema.json`, the field list in `homebridge-ui/public/script.js` (the schema parity test enforces they match) and `src/types.ts`
5. Add a test under `test/device/` using the real-HAP harness in `test/helpers/hap.ts`

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
- `scripts/generate-ui-models.js` generates `homebridge-ui/public/models.js` from the compiled `dist/` at build time (it runs after `tsc`)
- Tests live in `test/` and are excluded from the build via `tsconfig.json`; `tsconfig.test.json` type checks them. `test/helpers/hap.ts` provides real hap-nodejs services and a platform/accessory double for handler tests
- LAN discovery is unauthenticated: the LAN client trusts only a packet's source address, and LAN-only devices become accessories only if they are in the Govee account or the config
