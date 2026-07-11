// Mirrors category in schema v3 (BuildSmart_schema_v3.sql). Wire format
// (snake_case vs camelCase) UNVERIFIED against the backend — confirm before
// trusting at runtime.
export interface Category {
  category_id: number;
  category_type:
    | 'Structural'
    | 'Architectural'
    | 'Electrical'
    | 'Mechanical'
    | 'Plumbing'
    | 'Finishing'
    | 'Hardware'
    | 'Others';
  category_desc: string;
}
