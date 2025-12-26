export interface Peripheral {
  advertisement?: {
    manufacturerData?: Buffer;
  };
}

const h5074_uuid_rev = '88ec';
const h5075_uuid_rev = '88ec';
const h5101_uuid_rev = '0100';
const h5179_uuid_rev = '0188';

export function isHt5074(hex: string): boolean {
  return hex.includes(h5074_uuid_rev) && hex.length === 18;
}

export function isHt5075(hex: string): boolean {
  return hex.includes(h5075_uuid_rev) && hex.length === 16;
}

export function isHt5101(hex: string): boolean {
  return hex.includes(h5101_uuid_rev);
}

export function isHt5179(hex: string): boolean {
  return hex.includes(h5179_uuid_rev) && hex.length === 22;
}

export function isValidPeripheral(peripheral: Peripheral): boolean {
  const { advertisement } = peripheral;

  if (!advertisement || !advertisement.manufacturerData) {
    return false;
  }

  const hex = advertisement.manufacturerData.toString('hex');

  return !(!isHt5074(hex) && !isHt5075(hex) && !isHt5101(hex) && !isHt5179(hex));
}
