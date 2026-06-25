export interface QuotationServiceCost {
  service_cost_ID: number;
  quote_ID: number;
  service_type: string;
  description?: string;
  labor_cost: number;
  equipment_cost: number;
  contingency_cost: number;
  other_cost: number;
  subtotal: number;
}