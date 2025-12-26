import type { API, Characteristic as CharacteristicClass } from 'homebridge';

import type { CustomCharacteristicUUIDs } from '../types.js';

export default class CustomCharacteristics {
  public readonly uuids: CustomCharacteristicUUIDs;
  public readonly ColourMode: typeof CharacteristicClass;
  public readonly MusicMode: typeof CharacteristicClass;
  public readonly MusicModeTwo: typeof CharacteristicClass;
  public readonly Scene: typeof CharacteristicClass;
  public readonly SceneTwo: typeof CharacteristicClass;
  public readonly SceneThree: typeof CharacteristicClass;
  public readonly SceneFour: typeof CharacteristicClass;
  public readonly DiyMode: typeof CharacteristicClass;
  public readonly DiyModeTwo: typeof CharacteristicClass;
  public readonly DiyModeThree: typeof CharacteristicClass;
  public readonly DiyModeFour: typeof CharacteristicClass;
  public readonly Segmented: typeof CharacteristicClass;
  public readonly SegmentedTwo: typeof CharacteristicClass;
  public readonly SegmentedThree: typeof CharacteristicClass;
  public readonly SegmentedFour: typeof CharacteristicClass;
  public readonly VideoMode: typeof CharacteristicClass;
  public readonly VideoModeTwo: typeof CharacteristicClass;
  public readonly NightLight: typeof CharacteristicClass;
  public readonly DisplayLight: typeof CharacteristicClass;

  constructor(api: API) {
    this.uuids = {
      colourMode: 'E964F004-079E-48FF-8F27-9C2605A29F52',
      musicMode: 'E964F005-079E-48FF-8F27-9C2605A29F52',
      musicModeTwo: 'E964F006-079E-48FF-8F27-9C2605A29F52',
      scene: 'E964F007-079E-48FF-8F27-9C2605A29F52',
      sceneTwo: 'E964F008-079E-48FF-8F27-9C2605A29F52',
      diyMode: 'E964F009-079E-48FF-8F27-9C2605A29F52',
      diyModeTwo: 'E964F010-079E-48FF-8F27-9C2605A29F52',
      sceneThree: 'E964F011-079E-48FF-8F27-9C2605A29F52',
      sceneFour: 'E964F012-079E-48FF-8F27-9C2605A29F52',
      diyModeThree: 'E964F013-079E-48FF-8F27-9C2605A29F52',
      diyModeFour: 'E964F014-079E-48FF-8F27-9C2605A29F52',
      segmented: 'E964F015-079E-48FF-8F27-9C2605A29F52',
      segmentedTwo: 'E964F016-079E-48FF-8F27-9C2605A29F52',
      segmentedThree: 'E964F017-079E-48FF-8F27-9C2605A29F52',
      segmentedFour: 'E964F018-079E-48FF-8F27-9C2605A29F52',
      videoMode: 'E964F019-079E-48FF-8F27-9C2605A29F52',
      videoModeTwo: 'E964F020-079E-48FF-8F27-9C2605A29F52',
      nightLight: 'E964F021-079E-48FF-8F27-9C2605A29F52',
      displayLight: 'E964F022-079E-48FF-8F27-9C2605A29F52',
    };

    const uuids = this.uuids;
    const { Characteristic, Formats, Perms } = api.hap;

    this.ColourMode = class extends Characteristic {
      static readonly UUID = uuids.colourMode;
      constructor() {
        super('Colour Mode', uuids.colourMode);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.MusicMode = class extends Characteristic {
      static readonly UUID = uuids.musicMode;
      constructor() {
        super('Music Mode', uuids.musicMode);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.MusicModeTwo = class extends Characteristic {
      static readonly UUID = uuids.musicModeTwo;
      constructor() {
        super('Music Mode 2', uuids.musicModeTwo);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.Scene = class extends Characteristic {
      static readonly UUID = uuids.scene;
      constructor() {
        super('Scene', uuids.scene);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.SceneTwo = class extends Characteristic {
      static readonly UUID = uuids.sceneTwo;
      constructor() {
        super('Scene 2', uuids.sceneTwo);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.SceneThree = class extends Characteristic {
      static readonly UUID = uuids.sceneThree;
      constructor() {
        super('Scene 3', uuids.sceneThree);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.SceneFour = class extends Characteristic {
      static readonly UUID = uuids.sceneFour;
      constructor() {
        super('Scene 4', uuids.sceneFour);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.DiyMode = class extends Characteristic {
      static readonly UUID = uuids.diyMode;
      constructor() {
        super('DIY Mode', uuids.diyMode);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.DiyModeTwo = class extends Characteristic {
      static readonly UUID = uuids.diyModeTwo;
      constructor() {
        super('DIY Mode 2', uuids.diyModeTwo);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.DiyModeThree = class extends Characteristic {
      static readonly UUID = uuids.diyModeThree;
      constructor() {
        super('DIY Mode 3', uuids.diyModeThree);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.DiyModeFour = class extends Characteristic {
      static readonly UUID = uuids.diyModeFour;
      constructor() {
        super('DIY Mode 4', uuids.diyModeFour);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.Segmented = class extends Characteristic {
      static readonly UUID = uuids.segmented;
      constructor() {
        super('Segmented', uuids.segmented);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.SegmentedTwo = class extends Characteristic {
      static readonly UUID = uuids.segmentedTwo;
      constructor() {
        super('Segmented 2', uuids.segmentedTwo);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.SegmentedThree = class extends Characteristic {
      static readonly UUID = uuids.segmentedThree;
      constructor() {
        super('Segmented 3', uuids.segmentedThree);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.SegmentedFour = class extends Characteristic {
      static readonly UUID = uuids.segmentedFour;
      constructor() {
        super('Segmented 4', uuids.segmentedFour);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.VideoMode = class extends Characteristic {
      static readonly UUID = uuids.videoMode;
      constructor() {
        super('Video Mode', uuids.videoMode);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.VideoModeTwo = class extends Characteristic {
      static readonly UUID = uuids.videoModeTwo;
      constructor() {
        super('Video Mode 2', uuids.videoModeTwo);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.NightLight = class extends Characteristic {
      static readonly UUID = uuids.nightLight;
      constructor() {
        super('Night Light', uuids.nightLight);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };

    this.DisplayLight = class extends Characteristic {
      static readonly UUID = uuids.displayLight;
      constructor() {
        super('Display Light', uuids.displayLight);
        this.setProps({
          format: Formats.BOOL,
          perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    };
  }
}
