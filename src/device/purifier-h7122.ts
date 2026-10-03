import { platformLang } from '../utils/index.js';
import { getTwoItemPosition, hexToDecimal } from '../utils/functions.js';
import { getAirQualityFromPM25, getAirQualityLabelFromPM25 } from '../catalog/index.js';
import { PurifierAirQualityBase } from './purifier-air-quality-base.js';

/**
 * Purifier device handler for H7122 model.
 * Supports on/off, 5-speed control, lock, display light, and PM2.5 air quality sensor.
 */
export class PurifierH7122Device extends PurifierAirQualityBase {
  protected readonly airQualityOpcode = '1c';

  private cacheAir = 0;
  private cacheAirQual = '';

  protected setupAirQuality(): void {
    this.addCharacteristicIfMissing(this.airService, this.hapChar.PM2_5Density);
    this.cacheAir = this.airService.getCharacteristic(this.hapChar.PM2_5Density).value as number;
  }

  protected handleAirQualityUpdate(hexParts: string[]): void {
    const qualHex = `${getTwoItemPosition(hexParts, 4)}${getTwoItemPosition(hexParts, 5)}`;
    const qualDec = hexToDecimal(`0x${qualHex}`);
    if (qualDec === this.cacheAir) {
      return;
    }

    this.cacheAir = qualDec;
    this.airService.updateCharacteristic(this.hapChar.PM2_5Density, this.cacheAir);
    this.accessory.log(`${platformLang.curPM25} [${qualDec}µg/m³]`);

    // Update air quality based on PM2.5 ranges using catalog functions
    const airQualValue = getAirQualityFromPM25(this.cacheAir);
    const newAirQual = getAirQualityLabelFromPM25(this.cacheAir);

    if (this.cacheAirQual !== newAirQual) {
      this.cacheAirQual = newAirQual;
      this.airService.updateCharacteristic(this.hapChar.AirQuality, airQualValue);
      this.accessory.log(`${platformLang.curAirQual} [${newAirQual}]`);
    }
  }
}

