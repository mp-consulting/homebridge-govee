# Summary of GitHub Issues — homebridge-plugins/homebridge-govee

**Source:** https://github.com/homebridge-plugins/homebridge-govee/issues
**Date:** 2026-03-08
**Total issues (all time):** ~336 | **Currently open:** ~68

---

## Overview

The vast majority of issues are **new device support requests** (~60-65% of all open issues). The remaining issues are split between **bug reports** (~20%), **feature requests** (~10%), and **installation/upgrade problems** (~5%).

---

## 1. New Device Support Requests (~45 open)

The largest category by far. Users submit the Govee model number and device JSON, requesting the plugin add support for their hardware. Commonly requested device types:

### Lights (largest subcategory)
| Issue | Model | Device |
|-------|-------|--------|
| #1241 | H60C1 | Pendant Light (add to Matter ignore list) |
| #1236 | H611D4 | Neon Rope Light 2 RGBIC |
| #1230 | H60B0 | Uplighter |
| #1229 | H8066 | Outdoor Can Light |
| #1228 | H8076 | Floor Lamp Lite |
| #1227 | H80A1 | Dining Room Light |
| #1223 | H601F | Recessed Ceiling Light |
| #1220 | H8015 | Smart Lamp |
| #1219 | H8811 | Net Lights |
| #1218 | H60A6 | 15" Smart Ceiling Light Pro |
| #1209 | H6871 | Christmas Sparkle String Lights |
| #1141 | H6631 | Pixel Gaming Light |
| #1136 | H60B2 | Tree Floor Lamp |
| #1069 | H6013 | Light |
| #1037 | H61F2 | Light Strip |
| #1035 | H6069 | Mini Panel Lights |
| #938 | H6169 | LED TV Backlight |
| #937 | H612B | Strip Light |
| #930 | H6022 | Light |
| #907 | H70D1 | Icicle Lights |
| #904 | H61F5 | Strip Light 2 Pro |
| #903 | H70B4 | Curtain Lights 2 |
| #901 | H70C5 | RGBWIC String Lights |
| #896 | H61F5 | Light Strip |
| #892 | H7037 | Light |
| #891 | H6039 | Wall Sconces |
| #886 | H6097 | RGBIC TV Backlight 3 Lite |

### Appliances & Sensors
| Issue | Model | Device |
|-------|-------|--------|
| #1239 | H7152 | Smart Dehumidifier Max |
| #1235 | H5010 | Smart Body Fat Scale |
| #1211 | H7128/H7129 | Air Purifiers |
| #1129 | H5059 | Leak Sensor |
| #1040 | H7145 | Humidifier |
| #1031 | H7149 | Humidifier |
| #1029 | H5125 | Button Remote (6-button) |
| #1026 | H5121 | Indoor Motion Sensor |
| #1019 | H717A | Kettle |
| #932 | H7147 | Smart Mini Humidifier |
| #906 | H717D | Smart Ice Maker |
| #900 | H7124 | Air Purifier |
| #898 | H5126 | 2-Button Switch |
| #889 | H5121 | Motion Sensor |
| #888 | H712C | Large Air Purifier |
| #878 | H7127 | Purifier |
| #872 | — | Smart Outlet |

### Sync Boxes & Other
| Issue | Model | Device |
|-------|-------|--------|
| #1070 | H8604 | Smart AI Sync Box |
| #1212 | — | Sync box HDMI port exposure |

---

## 2. Bug Reports (~15 open)

### Brightness & Color Issues
- **#1226** — Brightness mismatch: setting 100% shows 39% in HomeKit/Govee app
- **#1038** — H6008 brightness wraps around above 96-97%
- **#934** — H6006 reports 39% brightness at max via AWS (scaling bug)
- **#1081** — HomeKit scenes not applying colors correctly
- **#1053** — H610A color/brightness selector issues
- **#1024** — Color changes not responding in Apple Home
- **#1240** — T2 TV Lighting: color values in automations cause awkward behavior

### BLE (Bluetooth) Issues
- **#1208** — H617A BLE control characteristic not found
- **#1207** — H617E BLE control characteristic not found
- **#1131** — H617C lightstrips non-responsive; BLE "No such device" error

### Connectivity & Sync
- **#1234** — AWS sync: lights occasionally fail to respond to scene triggers
- **#1214** — General instability/sync issues since v11.11.0
- **#1075** — H619C devices showing "No Response" in HomeKit
- **#1079** — H7127 air purifier & H7140 humidifier unresponsive controls
- **#1130** — H5083 power outlet unresponsive in child bridge mode
- **#1033** — Devices disappear from Home app after initial setup
- **#1139** — H613E timeout after 10 seconds

### Scenes & Automations
- **#908** — Tap-To-Run entries not showing after bridge restart
- **#890** — Scenes not functioning with H805C outdoor lights
- **#876** — "New Scene Code" message logged 10+ times per minute (H7123)

### Device State
- **#905** — Duplicates and old names in device list (caching issues)
- **#936** — H7172 Ice Maker: "devInstance is not a constructor" error
- **#873** — H7105 fan oscillation/swing not working
- **#1123** — Adaptive lighting resets when device powered off via physical switch
- **#1021** — H600A & H6008 adaptive lighting disabled

### Matter Integration
- **#1215** — Matter ignore feature not functioning properly
- **#928** — H6811 net lights should be added to Matter exclusion list

---

## 3. Feature Requests (~8 open)

- **#1240** — Option to disable/hide color controls (brightness-only mode)
- **#1210** — H7105 fan oscillation/swing mode
- **#1212** — Expose sync box HDMI ports as separate accessories
- **#1073** — Control segmented lights individually (H7057)
- **#1044** — H6199 video/game mode support
- **#1030** — Assume device state "off" when offline (like Home Assistant)
- **#902** — Temperature controls for H713A smart heater
- **#941** — LAN control: select which network interface for multicast packets
- **#1134** — Inquiry about TypeScript conversion (already done)

---

## 4. Installation & Upgrade Issues (~3 open)

- **#1222** — Upgrade from v11.10 to v11.13 fails with error 127 (missing `patch-package`)
- **#935** — Upgrade from v10.9.2 to v10.12.1 fails with ENOTEMPTY error
- **#1140** — Cannot uninstall plugin (ENOTEMPTY on Unraid Docker)

---

## 5. Documentation & Configuration

- **#933** — Where to find 23-digit Govee Device ID (needs clearer docs)
- **#1067** — Manual light configuration guidance

---

## Key Themes & Takeaways

1. **Device support is the dominant need.** The plugin supports many Govee models, but Govee releases new hardware frequently. A streamlined process for community-contributed device definitions would reduce maintainer burden.

2. **Brightness scaling bugs recur.** Multiple issues (#1226, #1038, #934) report the same 39% brightness or wraparound behavior, particularly over AWS connections. This suggests a systemic issue in brightness value mapping.

3. **BLE reliability is fragile.** Several issues trace back to incorrect BLE characteristic UUIDs or missing native module support. BLE-only devices are particularly affected.

4. **Matter coexistence needs attention.** Users with Matter-enabled Govee devices need them excluded from the plugin to avoid conflicts. The Matter ignore list needs frequent updates.

5. **Installation failures on npm upgrades** appear periodically (ENOTEMPTY errors), likely related to npm cache or Docker volume issues rather than plugin code.
