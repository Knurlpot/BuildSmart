// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Matches MaterialPriceVariance exactly
// (types/entities/material-price-variance.ts), same field casing (note: that file still
// uses `variance_ID`, not yet aligned to lowercase `_id` — this fixture mirrors it as-is
// rather than silently "fixing" the casing here).
import type { MaterialPriceVariance } from "@/types/entities";

export const materialPriceVariancesFixture: MaterialPriceVariance[] = [
  {
    variance_ID: 1,
    item_code: 201,
    quarter: "Q1",
    year: 2026,
    percent_change: 3.4,
    trend_direction: "Up",
    is_significant_spike: false,
  },
  {
    variance_ID: 2,
    item_code: 202,
    quarter: "Q1",
    year: 2026,
    percent_change: 4.8,
    trend_direction: "Up",
    is_significant_spike: false,
  },
  {
    variance_ID: 3,
    item_code: 203,
    quarter: "Q1",
    year: 2026,
    percent_change: -1.5,
    trend_direction: "Down",
    is_significant_spike: false,
  },
  {
    variance_ID: 4,
    item_code: 204,
    quarter: "Q1",
    year: 2026,
    percent_change: 22.7,
    trend_direction: "Up",
    is_significant_spike: true,
  },
];
