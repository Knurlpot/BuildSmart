// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Backs POST /api/pricelist/fetch-published.
// Matches FlaggedPriceDeviation exactly (hooks/usePricelistPublishedSource.ts). DPWH-only:
// PSA publishes index numbers, not peso prices, so it never had real deviation rows here —
// the earlier PSA peso rows in this fixture were fabricated and have been removed. See
// psaIndex.ts for PSA's actual (index-shaped) fixture.
import type { FlaggedPriceDeviation } from "@/hooks/usePricelistPublishedSource";

export const flaggedPriceDeviationsFixture: FlaggedPriceDeviation[] = [
  {
    item_code: 301,
    item_name: "Galvanized Roofing Sheet, Gauge 26",
    region: "NCR",
    quarter: "Q1",
    year: 2026,
    previous_price: 620,
    new_price: 742,
    percent_change: 19.7,
    source: "DPWH",
  },
  {
    item_code: 305,
    item_name: "Copper Plumbing Fitting, Elbow 1/2\"",
    region: "NCR",
    quarter: "Q1",
    year: 2026,
    previous_price: 48,
    new_price: 65,
    percent_change: 35.4,
    source: "DPWH",
  },
  {
    item_code: 302,
    item_name: "Reinforced Concrete Hollow Block, 6\"",
    region: "Region III",
    quarter: "Q1",
    year: 2026,
    previous_price: 22,
    new_price: 25,
    percent_change: 13.6,
    source: "DPWH",
  },
  {
    item_code: 308,
    item_name: "Tempered Glass Panel, 10mm",
    region: "NCR",
    quarter: "Q1",
    year: 2026,
    previous_price: 3200,
    new_price: 2850,
    percent_change: -10.9,
    source: "DPWH",
  },
];
