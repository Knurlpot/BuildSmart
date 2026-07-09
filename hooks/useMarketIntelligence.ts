// Assumed endpoints — ALL UNVERIFIED, confirm with the backend team:
//   GET /api/historical-price-records?region=<region>
//   GET /api/material-price-variances?region=<region>
//   GET /api/market-insights?region=<region>&item_code=<item_code>   (Gemini-generated text)
//
// Only `region` is sent as a query param. The material/item selector is applied
// client-side over the region-scoped historical records (mirrors the Replit
// reference's derive-filter-options-from-data pattern) rather than as a second
// server round-trip, since there is no confirmed per-item filter on these
// endpoints. HistoricalPriceRecord has no human-readable label (only the
// opaque item_code FK), so `item_name`/`material` below are an assumed
// enrichment the backend may or may not actually join in.
import { useMemo } from 'react';
import { useFetch, type UseFetchResult } from './useFetch';
import type { HistoricalPriceRecord, MaterialPriceVariance } from '@/types/entities';

export interface HistoricalPriceRecordRow extends HistoricalPriceRecord {
  item_name?: string;
  material?: string;
}

export interface MarketInsight {
  item_code: HistoricalPriceRecord['item_code'];
  insight: string;
}

export interface UseMarketIntelligenceParams {
  region?: string;
  itemCode?: HistoricalPriceRecord['item_code'];
}

export interface UseMarketIntelligenceResult {
  historical: UseFetchResult<HistoricalPriceRecordRow[]>;
  variances: UseFetchResult<MaterialPriceVariance[]>;
  insight: UseFetchResult<MarketInsight>;
}

export function useMarketIntelligence(
  { region, itemCode }: UseMarketIntelligenceParams = {}
): UseMarketIntelligenceResult {
  const regionQuery = useMemo(() => {
    if (!region || region === 'All') return '';
    return `?region=${encodeURIComponent(region)}`;
  }, [region]);

  const historical = useFetch<HistoricalPriceRecordRow[]>(
    `/api/historical-price-records${regionQuery}`
  );
  const variances = useFetch<MaterialPriceVariance[]>(
    `/api/material-price-variances${regionQuery}`
  );

  const insightEndpoint = useMemo(() => {
    if (itemCode === undefined) return null;
    const params = new URLSearchParams({ item_code: String(itemCode) });
    if (region && region !== 'All') params.set('region', region);
    return `/api/market-insights?${params.toString()}`;
  }, [region, itemCode]);
  const insight = useFetch<MarketInsight>(insightEndpoint);

  return { historical, variances, insight };
}
