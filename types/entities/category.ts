// Mirrors CATEGORY_TYPES from backend/app/services/categories.py
// Must stay in sync with database CHECK constraint in category table
export const CATEGORY_TYPES = [
  'Structural',
  'Concrete & Masonry',
  'Reinforcement & Steel',
  'Timber & Lumber',
  'Roofing',
  'Insulation & Waterproofing',
  'Masonry Units & Blocks',
  'Doors, Windows & Glazing',
  'Finishing',
  'Flooring & Tiles',
  'Ceilings & Suspended Systems',
  'Paints, Coatings & Sealants',
  'Plumbing & Pipework',
  'HVAC & Mechanical',
  'Electrical & Lighting',
  'Hardware & Fasteners',
  'Adhesives & Tapes',
  'Tools, Equipment & Consumables',
  'Safety & PPE',
  'Landscaping & Siteworks',
  'Specialty Materials & Systems',
  'Others',
] as const;

export type CategoryType = (typeof CATEGORY_TYPES)[number];

export interface Category {
  category_id: number;
  category_type: CategoryType;
  category_desc: string;
}
