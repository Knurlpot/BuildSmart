// Decorative geographic color spectrum for the Client Card (Quotation Generation, Part B).
// Island group gets its own hue family — Luzon warm reds, Visayas orange/yellow, Mindanao
// blue/purple — purely so a client's region reads as visually distinct at a glance.
//
// ⚠️ NON-RANKING, READ THIS BEFORE EXTENDING: this is a fixed geographic taxonomy, not an
// economic-tier or importance scale. Island group order (Luzon, then Visayas, then
// Mindanao) carries no meaning beyond "a different part of the country," and there is no
// legend anywhere implying otherwise. Do not attach a size/value/priority connotation to any
// of these hues.
import type { PhRegion } from '@/types/entities/common';

const LUZON: PhRegion[] = ['Region I', 'Region II', 'Region III', 'Region IV-A', 'Region IV-B', 'Region V', 'CAR', 'NCR'];
const VISAYAS: PhRegion[] = ['Region VI', 'Region VII', 'Region VIII', 'NIR'];
const MINDANAO: PhRegion[] = ['Region IX', 'Region X', 'Region XI', 'Region XII', 'Region XIII', 'BARMM'];

// Brand's base orange — used before a region is selected, so the neutral state still reads
// as "this app," not an arbitrary 4th color family. Exported so callers driving a CSS
// hue-rotate() filter (which shifts a base color rather than setting an absolute hue) can
// compute the right rotation amount: rotation = regionToHue(region) - NEUTRAL_HUE.
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
