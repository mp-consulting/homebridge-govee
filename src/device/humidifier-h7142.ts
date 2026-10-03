import type { Service } from 'homebridge';
import { platformLang } from '../utils/index.js';
import {
  getTwoItemPosition,
  hexToDecimal,
  sleep,
  type CommandHandlerFn,
} from '../utils/functions.js';
import { HUMIDIFIER_H7142_UV_ON } from '../catalog/index.js';
import { HumidifierH7160Device } from './humidifier-h7160.js';

/**
 * Humidifier device handler for H7142 model.
 * The H7160 feature set (on/off, 9-speed control, RGB night light) plus a humidity sensor and UV light.
 */
export class HumidifierH7142Device extends HumidifierH7160Device {
  private humiService!: Service;

  // Cached values
  private cacheMode: 'manual' | 'custom' | 'auto' = 'manual';
  private cacheHumi = 0;
  private cacheUV: 'on' | 'off' = 'off';
  private cacheDisplay: 'on' | 'off' = 'off';

  protected override setupHumiditySensor(): void {
    this.humiService = this.getOrAddService(this.hapServ.HumiditySensor);
    this.cacheHumi = this.humiService.getCharacteristic(this.hapChar.CurrentRelativeHumidity).value as number;
    // The UV light follows the power state
    this.cacheUV = this._service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off';
  }

  /** The UV light is switched on with the humidifier */
  protected override async afterPowerChange(on: boolean): Promise<void> {
    if (on && this.cacheUV === 'off') {
      await sleep(200);
      await this.sendDeviceUpdate({ cmd: 'ptReal', value: HUMIDIFIER_H7142_UV_ON });
    }
    const uv = on ? 'on' : 'off';
    if (this.cacheUV !== uv) {
      this.cacheUV = uv;
      this.accessory.log(`current uv light [${this.cacheUV}]`);
    }
  }

  protected override commandHandlers(): Record<string, CommandHandlerFn> {
    return {
      ...super.commandHandlers(),
      '0500': (hexParts) => this.handleModeUpdate(hexParts),
      '1001': (hexParts) => this.handleHumidityUpdate(hexParts),
      '1800': () => this.handleDisplayUpdate('off'),
      '1801': () => this.handleDisplayUpdate('on'),
      '1a00': () => this.handleUVUpdate('off'),
      '1a01': () => this.handleUVUpdate('on'),
      '0503': (hexParts) => this.handleAutoModeUpdate(hexParts),
      // Ignored commands
      '0502': () => {}, // custom mode
      '1100': () => {}, // timer
      '1101': () => {}, // timer
      '1300': () => {}, // scheduling
      '1500': () => {}, // scheduling
    };
  }

  private handleModeUpdate(hexParts: string[]): void {
    const newModeRaw = getTwoItemPosition(hexParts, 4);
    const modeMap: Record<string, 'manual' | 'custom' | 'auto'> = {
      '01': 'manual',
      '02': 'custom',
      '03': 'auto',
    };
    const newMode = modeMap[newModeRaw];
    if (newMode && this.cacheMode !== newMode) {
      this.cacheMode = newMode;
      this.accessory.log(`${platformLang.curMode} [${this.cacheMode}]`);
    }
  }

  private handleHumidityUpdate(hexParts: string[]): void {
    const humiCheck = getTwoItemPosition(hexParts, 4);
    if (humiCheck === '00') {
      const newHumiHex = `${getTwoItemPosition(hexParts, 5)}${getTwoItemPosition(hexParts, 6)}`;
      const newHumiDec = Math.round(hexToDecimal(newHumiHex)) / 10;
      const newHumiHKValue = Math.round(newHumiDec);
      if (newHumiHKValue !== this.cacheHumi) {
        this.cacheHumi = newHumiHKValue;
        this.humiService.updateCharacteristic(this.hapChar.CurrentRelativeHumidity, this.cacheHumi);
        this.accessory.log(`${platformLang.curHumi} [${this.cacheHumi}%]`);
      }
    } else {
      // Humidity arrives in a variant we don't parse yet — log it so device owners can
      // report the payload format (upstream issue #1294: humidity stuck at 0%)
      this.accessory.logDebugWarn(`unparsed humidity payload [1001] [${hexParts.join('')}]`);
    }
  }

  private handleAutoModeUpdate(hexParts: string[]): void {
    // Auto mode: byte 4 is believed to hold the target humidity — log for verification
    // before exposing target humidity control (upstream issue #1294)
    const targetHumi = hexToDecimal(getTwoItemPosition(hexParts, 4));
    this.accessory.logDebug(`auto mode reported [target ~${targetHumi}%] [${hexParts.join('')}]`);
  }

  private handleDisplayUpdate(newDisplay: 'on' | 'off'): void {
    if (newDisplay !== this.cacheDisplay) {
      this.cacheDisplay = newDisplay;
      this.accessory.log(`${platformLang.curDisplay} [${this.cacheDisplay}]`);
    }
  }

  private handleUVUpdate(newUV: 'on' | 'off'): void {
    if (newUV !== this.cacheUV) {
      this.cacheUV = newUV;
      this.accessory.log(`current uv light [${this.cacheUV}]`);
    }
  }
}

