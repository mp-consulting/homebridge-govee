import type { API, Characteristic as CharacteristicClass } from 'homebridge';

import type { EveCharacteristicUUIDs } from '../types.js';

export default class EveCharacteristics {
  public readonly uuids: EveCharacteristicUUIDs;
  public readonly CurrentConsumption: typeof CharacteristicClass;
  public readonly Voltage: typeof CharacteristicClass;
  public readonly ElectricCurrent: typeof CharacteristicClass;
  public readonly LastActivation: typeof CharacteristicClass;

  constructor(api: API) {
    this.uuids = {
      currentConsumption: 'E863F10D-079E-48FF-8F27-9C2605A29F52',
      voltage: 'E863F10A-079E-48FF-8F27-9C2605A29F52',
      electricCurrent: 'E863F126-079E-48FF-8F27-9C2605A29F52',
      lastActivation: 'E863F11A-079E-48FF-8F27-9C2605A29F52',
    };

    const uuids = this.uuids;
    const { Characteristic, Formats, Perms, Units } = api.hap;

    this.CurrentConsumption = class extends Characteristic {
      static readonly UUID = uuids.currentConsumption;
      constructor() {
        super('Current Consumption', uuids.currentConsumption);
        this.setProps({
          format: Formats.UINT16,
          unit: 'W',
          maxValue: 100000,
          minValue: 0,
          minStep: 1,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.Voltage = class extends Characteristic {
      static readonly UUID = uuids.voltage;
      constructor() {
        super('Voltage', uuids.voltage);
        this.setProps({
          format: Formats.FLOAT,
          unit: 'V',
          maxValue: 100000000000,
          minValue: 0,
          minStep: 1,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.ElectricCurrent = class extends Characteristic {
      static readonly UUID = uuids.electricCurrent;
      constructor() {
        super('Electric Current', uuids.electricCurrent);
        this.setProps({
          format: Formats.FLOAT,
          unit: 'A',
          maxValue: 100000000000,
          minValue: 0,
          minStep: 0.1,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.LastActivation = class extends Characteristic {
      static readonly UUID = uuids.lastActivation;
      constructor() {
        super('Last Activation', uuids.lastActivation);
        this.setProps({
          format: Formats.UINT32,
          unit: Units.SECONDS,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };
  }
}
