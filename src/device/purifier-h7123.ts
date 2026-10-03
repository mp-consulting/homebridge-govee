import { platformLang } from '../utils/index.js';
import { getTwoItemPosition } from '../utils/functions.js';
import { AIR_QUALITY_LABELS } from '../catalog/index.js';
import { PurifierAirQualityBase } from './purifier-air-quality-base.js';

// HomeKit poor air quality value
const HOMEKIT_POOR_AIR_QUALITY = 5;

/**
 * Purifier device handler for H7123/H7124 models.
 * Supports on/off, 5-mode control, air quality level (no PM2.5), night light (read-only), lock, and display light.
 */
export class PurifierH7123Device extends PurifierAirQualityBase {
  protected readonly airQualityOpcode = '19';

  private cacheAir = 1;

  protected setupAirQuality(): void {
    // H7123 reports an air quality level only, no PM2.5 density
    this.removeCharacteristicIfExists(this.airService, this.hapChar.PM2_5Density);
    this.cacheAir = this.airService.getCharacteristic(this.hapChar.AirQuality).value as number || 1;

    // Night light custom characteristic (read-only for H7123)
    this.addCustomCharacteristic(this._service, this.platform.cusChar.NightLight);
  }

  protected handleAirQualityUpdate(hexParts: string[]): void {
    // Air quality reading (1=green, 2=blue, 3=yellow, 4=red)
    // Cache will be in {1, 2, 3, 5} which relates to Govee {1, 2, 3, 4}
    let newQual = Number.parseInt(getTwoItemPosition(hexParts, 5), 10);
    const goveeMaxQuality = 4;
    if (newQual === goveeMaxQuality) {
      newQual = HOMEKIT_POOR_AIR_QUALITY; // HomeKit uses 5 for "Poor"
    }

    if (newQual !== this.cacheAir) {
      this.cacheAir = newQual;
      this.airService.updateCharacteristic(this.hapChar.AirQuality, newQual);
      this.accessory.log(`${platformLang.curAirQual} [${AIR_QUALITY_LABELS[Math.min(newQual, goveeMaxQuality)]}]`);
    }
  }
}

