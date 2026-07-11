// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Backs POST /api/pricelist/fetch-published-index.
// Matches PsaIndexEntry exactly (hooks/usePricelistPublishedSource.ts). NCR only — PSA
// publishes no other region. index_value is the ASSUMED enrichment flagged in that file;
// included here so the UI is reviewable, but real integration must treat it as optional.
import type { PsaIndexEntry } from "@/hooks/usePricelistPublishedSource";

export const psaIndexFixture: PsaIndexEntry[] = [
  {
    commodity_group: "Cement",
    quarter: "Q1",
    year: 2026,
    index_value: 132.4,
    percent_change: 6.2,
    trend_direction: "Up",
    is_significant_spike: false,
  },
  {
    commodity_group: "Steel & Reinforcing Steel",
    quarter: "Q1",
    year: 2026,
    index_value: 148.9,
    percent_change: 18.4,
    trend_direction: "Up",
    is_significant_spike: true,
  },
  {
    commodity_group: "Lumber",
    quarter: "Q1",
    year: 2026,
    index_value: 109.1,
    percent_change: -2.3,
    trend_direction: "Down",
    is_significant_spike: false,
  },
  {
    commodity_group: "Plywood",
    quarter: "Q1",
    year: 2026,
    index_value: 114.6,
    percent_change: 1.1,
    trend_direction: "Stable",
    is_significant_spike: false,
  },
  {
    commodity_group: "Hardware",
    quarter: "Q1",
    year: 2026,
    index_value: 121.8,
    percent_change: 4.5,
    trend_direction: "Up",
    is_significant_spike: false,
  },
  {
    commodity_group: "Electrical Works",
    quarter: "Q1",
    year: 2026,
    index_value: 118.3,
    percent_change: 3.0,
    trend_direction: "Up",
    is_significant_spike: false,
  },
  {
    commodity_group: "Plumbing",
    quarter: "Q1",
    year: 2026,
    index_value: 116.7,
    percent_change: -0.8,
    trend_direction: "Down",
    is_significant_spike: false,
  },
];
