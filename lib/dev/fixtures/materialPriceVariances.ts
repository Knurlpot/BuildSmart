// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Matches MaterialPriceVariance exactly
// (types/entities/material-price-variance.ts), same field casing.
//
// Mixes 'Internal' (per-item) and 'PSA' (per-commodity-group index, analytics-only)
// rows in one list, same as the assumed /api/material-price-variances response —
// PriceTrendsPanel is responsible for splitting/labeling them, not this fixture.
import type { MaterialPriceVariance } from "@/types/entities";

export const materialPriceVariancesFixture: MaterialPriceVariance[] = [
  {
    mpv_id: 1,
    item_code: 201,
    variance_source: "Internal",
    commodity_group: null,
    quarter: "Q1",
    year: 2026,
    percent_change: 3.4,
    trend_direction: "Up",
    is_significant_spike: false,
  },
  {
    mpv_id: 2,
    item_code: 202,
    variance_source: "Internal",
    commodity_group: null,
    quarter: "Q1",
    year: 2026,
    percent_change: 4.8,
    trend_direction: "Up",
    is_significant_spike: false,
  },
  {
    mpv_id: 3,
    item_code: 203,
    variance_source: "Internal",
    commodity_group: null,
    quarter: "Q1",
    year: 2026,
    percent_change: -1.5,
    trend_direction: "Down",
    is_significant_spike: false,
  },
  {
    mpv_id: 4,
    item_code: 204,
    variance_source: "Internal",
    commodity_group: null,
    quarter: "Q1",
    year: 2026,
    percent_change: 22.7,
    trend_direction: "Up",
    is_significant_spike: true,
  },
  {
    mpv_id: 5,
    item_code: null,
    variance_source: "PSA",
    commodity_group: "Cement",
    quarter: "Q1",
    year: 2026,
    percent_change: 6.2,
    trend_direction: "Up",
    is_significant_spike: false,
  },
  {
    mpv_id: 6,
    item_code: null,
    variance_source: "PSA",
    commodity_group: "Steel & Metal Products",
    quarter: "Q1",
    year: 2026,
    percent_change: 18.4,
    trend_direction: "Up",
    is_significant_spike: true,
  },
];
