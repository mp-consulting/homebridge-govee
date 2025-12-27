declare module 'fakegato-history' {
  import type { API, PlatformAccessory } from 'homebridge';

  interface FakeGatoHistoryOptions {
    log?: (...args: unknown[]) => void;
    storage?: string;
    path?: string;
    filename?: string;
    disableTimer?: boolean;
    length?: number;
  }

  interface FakeGatoHistoryEntry {
    time?: number;
    status?: number;
    temp?: number;
    humidity?: number;
    power?: number;
    ppm?: number;
    voc?: number;
    pressure?: number;
    contact?: number;
    motion?: number;
    [key: string]: unknown;
  }

  interface FakeGatoHistoryService {
    addEntry(entry: FakeGatoHistoryEntry): void;
    getInitialTime(): number;
  }

  type FakeGatoHistoryType = 'weather' | 'energy' | 'room' | 'door' | 'motion' | 'switch' | 'thermo' | 'aqua' | 'custom';

  function FakeGatoHistory(
    api: API
  ): new (
    type: FakeGatoHistoryType,
    accessory: PlatformAccessory,
    options?: FakeGatoHistoryOptions
  ) => FakeGatoHistoryService;

  export = FakeGatoHistory;
}
