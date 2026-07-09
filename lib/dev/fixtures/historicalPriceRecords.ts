// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Matches HistoricalPriceRecordRow
// exactly (types/entities/historical-price-record.ts + the assumed enrichment in
// hooks/useMarketIntelligence.ts), same field casing.
import type { HistoricalPriceRecordRow } from "@/hooks/useMarketIntelligence";

const QUARTERS: { quarter: HistoricalPriceRecordRow["quarter"]; year: number }[] = [
  { quarter: "Q1", year: 2025 },
  { quarter: "Q2", year: 2025 },
  { quarter: "Q3", year: 2025 },
  { quarter: "Q4", year: 2025 },
  { quarter: "Q1", year: 2026 },
];

const ITEMS: { item_code: number; item_name: string; material: string; prices: number[] }[] = [
  {
    item_code: 201,
    item_name: "Standard Roofing Sheet",
    material: "Galvanized Steel",
    prices: [640, 655, 668, 682, 705],
  },
  {
    item_code: 202,
    item_name: "Reinforced Concrete Block",
    material: "Concrete",
    prices: [58, 60, 61, 63, 66],
  },
  {
    item_code: 203,
    item_name: "Exterior Paint Primer",
    material: "Acrylic Coating",
    prices: [410, 405, 398, 402, 396],
  },
];

let nextId = 1;

export const historicalPriceRecordsFixture: HistoricalPriceRecordRow[] = ITEMS.flatMap((item) =>
  QUARTERS.map(({ quarter, year }, i) => ({
    historicalrec_id: nextId++,
    item_code: item.item_code,
    item_name: item.item_name,
    material: item.material,
    source: i % 2 === 0 ? "DPWH" : "Supplier Upload",
    region: "NCR",
    quarter,
    year,
    price: item.prices[i],
    recorded_at: `${year}-${quarter === "Q1" ? "01" : quarter === "Q2" ? "04" : quarter === "Q3" ? "07" : "10"}-15T00:00:00.000Z`,
  }))
);
