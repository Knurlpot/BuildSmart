import type { PhRegion } from '@/types/entities/common';

const LUZON: PhRegion[] = ['Region I', 'Region II', 'Region III', 'Region IV-A', 'Region IV-B', 'Region V', 'CAR', 'NCR'];
const VISAYAS: PhRegion[] = ['Region VI', 'Region VII', 'Region VIII', 'NIR'];
const MINDANAO: PhRegion[] = ['Region IX', 'Region X', 'Region XI', 'Region XII', 'Region XIII', 'BARMM'];

export const NEUTRAL_HUE = 24;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic — the same region always lands on the same hue within its island group's family. */
export function regionToHue(region: string): number {
  if (!region.trim()) return NEUTRAL_HUE;
  const r = region as PhRegion;
  if (LUZON.includes(r)) return hashString(region) % 25; // 0-24: red / red-orange
  if (VISAYAS.includes(r)) return 28 + (hashString(region) % 28); // 28-55: orange / yellow
  if (MINDANAO.includes(r)) return 220 + (hashString(region) % 60); // 220-279: blue / purple
  return NEUTRAL_HUE;
}