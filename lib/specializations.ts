// Profile Specializations
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

export interface SpecializationColumns {
  specialization_1: string;
  specialization_2: string | null;
  specialization_3: string | null;
}

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

export function formatSpecializations(selected: string[]): string {
  return selected.length ? `[${selected.join(', ')}]` : '—';
}