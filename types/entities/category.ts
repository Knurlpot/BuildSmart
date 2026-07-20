// Mirrors category in schema v3 (BuildSmart_schema_v3.sql). Wire format
// (snake_case vs camelCase) UNVERIFIED against the backend — confirm before
// trusting at runtime.
export const CATEGORY_TYPES = [
  'Structural',
  'Architectural',
  'Electrical',
  'Mechanical',
  'Plumbing',
  'Finishing',
  'Hardware',
  'Others',
] as const;

export type CategoryType = (typeof CATEGORY_TYPES)[number];

export interface Category {
  category_id: number;
  category_type: CategoryType;
  category_desc: string;
}
