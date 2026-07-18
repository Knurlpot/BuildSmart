// Allowed company specialization values — a fixed business taxonomy (client-provided
// supplier/trade categories), not fabricated data. Single source for SignUp and Company
// Profile so the two forms can never drift apart on what's selectable.
export const SPECIALIZATIONS = [
  'Ready-Mix Concrete & Aggregates',
  'Structural Steel & Rebar Fabricators',
  'Masonry & Brick Suppliers',
  'Lumber & Timber Yards',
  'Flooring & Tiling Specialists',
  'Glazing, Glass, & Fenestration',
  'Drywall, Plaster, & Ceiling Systems',
  'Paints, Coatings, & Sealants',
  'Electrical & Lighting Distributors',
  'Plumbing & Piping Suppliers',
  'HVAC & Ventilation Suppliers',
  'Waterproofing & Dampproofing Suppliers',
  'Insulation & Thermal Barrier Suppliers',
  'Adhesives, Epoxies, & Grouts',
  'Heavy Equipment Dealers (Sales & Rental)',
  'Industrial Tool & Fastener Suppliers',
  'Safety & PPE Suppliers',
  'Precast Concrete Suppliers',
  'Truss & Wall Panel Manufacturers',
  'Modular Pod Suppliers',
] as const;

export type Specialization = (typeof SPECIALIZATIONS)[number];

export const MAX_SPECIALIZATIONS = 3;

/** company.specialization_1/2/3 (schema v3: one required column + two nullable ones). */
export interface SpecializationColumns {
  specialization_1: string;
  specialization_2: string | null;
  specialization_3: string | null;
}

// Selection order is preserved (index 0 -> _1, 1 -> _2, 2 -> _3); unselected slots are
// null, never an empty string, so a PATCH/register payload can't be mistaken for "cleared
// to blank" vs. "never set."
export function specializationsToColumns(selected: string[]): SpecializationColumns {
  return {
    specialization_1: selected[0] ?? '',
    specialization_2: selected[1] ?? null,
    specialization_3: selected[2] ?? null,
  };
}

export function columnsToSpecializations(c: {
  specialization_1?: string | null;
  specialization_2?: string | null;
  specialization_3?: string | null;
}): string[] {
  return [c.specialization_1, c.specialization_2, c.specialization_3].filter(
    (v): v is string => !!v && v.trim().length > 0
  );
}

/** e.g. "[Waterproofing & Dampproofing Suppliers, Masonry & Brick Suppliers]" — used by
 * both the multi-select's closed-state summary and read-only profile previews. */
export function formatSpecializations(selected: string[]): string {
  return selected.length ? `[${selected.join(', ')}]` : '—';
}
