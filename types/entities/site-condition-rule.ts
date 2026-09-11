export const SITE_CONDITION_FIELDS = [
  { key: "storeys", label: "Number of storeys", valueType: "number", options: [] },
  { key: "site_spread", label: "Site footprint", valueType: "select", options: ["Compact footprint", "Wide horizontal footprint", "Multiple work zones"] },
  { key: "site_access", label: "Site accessibility", valueType: "select", options: ["Normal access", "Narrow access", "No truck access", "Restricted delivery hours"] },
  { key: "traffic_exposure", label: "Traffic / public exposure", valueType: "select", options: ["Low traffic", "Heavy pedestrian traffic", "Heavy vehicular traffic", "Roadside work"] },
  { key: "flood_drainage", label: "Flood / drainage condition", valueType: "select", options: ["Normal", "Flood-prone", "Actively waterlogged", "Poor drainage"] },
  { key: "ground_terrain", label: "Ground / terrain", valueType: "select", options: ["Level", "Sloped", "Soft ground", "Muddy", "Uneven", "Confined"] },
  { key: "weather_exposure", label: "Weather / environmental exposure", valueType: "select", options: ["Normal", "Extreme heat", "Frequent rain", "Exposed coastal / windy"] },
  { key: "site_occupancy", label: "Occupied / operational site", valueType: "select", options: ["Vacant site", "Occupied building", "Operational business", "Hospital / school"] },
  { key: "staging_space", label: "Staging and storage space", valueType: "select", options: ["Open staging area", "Limited staging", "No storage area"] },
  { key: "hazard_exposure", label: "Hazard / disaster exposure", valueType: "select", options: ["None identified", "Flood-prone", "Seismic-sensitive", "Landslide-prone", "Near waterway"] },
  { key: "security_constraint", label: "Security / neighborhood constraint", valueType: "select", options: ["Normal", "Restricted compound", "High-security facility"] },
  { key: "existing_utilities", label: "Utilities / existing services", valueType: "select", options: ["Clear site", "Known utilities", "Congested utilities", "Live electrical / water services"] },
] as const;

export type SiteConditionFieldKey = (typeof SITE_CONDITION_FIELDS)[number]["key"];
export type SiteConditionOperator = "equals" | "gte" | "lte";
export type SiteConditionEffectType = "line_item" | "equipment" | "safety" | "productivity" | "schedule" | "warning";
export type SiteConditionPricingMethod = "fixed" | "per_sqm" | "labor_percentage" | "manual_review";

export interface ProjectSiteCondition {
  field: SiteConditionFieldKey;
  value: string;
}

export interface SiteConditionRuleEffect {
  effect_key: string;
  effect_type: SiteConditionEffectType;
  label: string;
  description: string;
  pricing_method: SiteConditionPricingMethod;
  rate: number | null;
  percentage: number | null;
  schedule_days: number | null;
}

export interface SiteConditionRule {
  rule_id: string;
  rule_name: string;
  condition_field: SiteConditionFieldKey;
  operator: SiteConditionOperator;
  trigger_value: string;
  scope_of_work: string | null;
  effects: SiteConditionRuleEffect[];
  is_active: boolean;
  effective_date: string;
}

export interface TriggeredSiteConditionEffect extends SiteConditionRuleEffect {
  review_key: string;
  rule_id: string;
  rule_name: string;
  condition_label: string;
  condition_value: string;
  computed_amount: number | null;
}

export function siteConditionField(key: SiteConditionFieldKey) {
  return SITE_CONDITION_FIELDS.find((field) => field.key === key);
}
