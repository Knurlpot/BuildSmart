// Mirrors category in schema v3 (BuildSmart_schema_v3.sql). Wire format
// (snake_case vs camelCase) UNVERIFIED against the backend — confirm before
// trusting at runtime.
export type CategoryType =
  | 'Structural'
  | 'Architectural'
  | 'Electrical'
  | 'Mechanical'
  | 'Plumbing'
  | 'Finishing'
  | 'Hardware'
  | 'Others';

/** Runtime companion to CategoryType — for dropdowns needing all 8 values. */
export const CATEGORY_TYPES: CategoryType[] = [
  'Structural',
  'Architectural',
  'Electrical',
  'Mechanical',
  'Plumbing',
  'Finishing',
  'Hardware',
  'Others',
];

export interface Category {
  category_id: number;
  category_type: CategoryType;
  category_desc: string;
}
