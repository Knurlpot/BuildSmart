// Mirrors quotation_service_costs in the authoritative SQL. Wire format
// (snake_case vs camelCase) UNVERIFIED against the backend — confirm before
// trusting at runtime.
export interface QuotationServiceCost {
  service_cost_id: number;
  quote_id: number;
  service_type: string;
  description?: string;
  labor_cost: number;
  equipment_cost: number;
  contingency_cost: number;
  other_cost: number;
  subtotal: number;
}
