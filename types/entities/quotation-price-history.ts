export type QuotationPriceChangeReason = 'Initial Creation' | 'Manual Refresh' | 'Auto Refresh' | 'Manual Override';

export interface QuotationPriceHistory {
  price_history_id: number;
  quote_item_id: number;
  item_code?: number;
  item_name?: string;
  unit_cost_before: number;
  unit_cost_after: number;
  total_cost_before?: number | null;
  total_cost_after?: number | null;
  changed_at: string;
  changed_reason: QuotationPriceChangeReason;
  changed_by_user_id?: number | null;
}
