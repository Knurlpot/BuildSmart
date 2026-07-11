// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Backs GET /api/pricelist/catalog/dpwh.
// Matches DpwhCatalogRow exactly (hooks/usePricelistPublishedSource.ts).
//
// The first 4 rows share item_code/quarter/year with flaggedPriceDeviationsFixture, so
// resolving those flagged deviations (approve or keep) in the dev UI visibly colors the
// matching catalog row — the rest are filler, procedurally generated, to demonstrate
// pagination on a table this size.
import type { DpwhCatalogRow } from "@/hooks/usePricelistPublishedSource";

const RESOLVED_MATCHES: DpwhCatalogRow[] = [
  {
    historicalrec_id: 7001,
    item_code: 301,
    item_name: "Galvanized Roofing Sheet, Gauge 26",
    region: "NCR",
    quarter: "Q1",
    year: 2026,
    price: 742, // reflects the fixture's "new" price if approved
  },
  {
    historicalrec_id: 7002,
    item_code: 305,
    item_name: "Copper Plumbing Fitting, Elbow 1/2\"",
    region: "NCR",
    quarter: "Q1",
    year: 2026,
    price: 65,
  },
  {
    historicalrec_id: 7003,
    item_code: 302,
    item_name: "Reinforced Concrete Hollow Block, 6\"",
    region: "Region III",
    quarter: "Q1",
    year: 2026,
    price: 25,
  },
  {
    historicalrec_id: 7004,
    item_code: 308,
    item_name: "Tempered Glass Panel, 10mm",
    region: "NCR",
    quarter: "Q1",
    year: 2026,
    price: 2850,
  },
];

const MATERIALS: { name: string; basePrice: number }[] = [
  { name: "Portland Cement, Type 1", basePrice: 265 },
  { name: "Deformed Steel Rebar, 12mm", basePrice: 58 },
  { name: "Kiln-dried Timber Plank, 2x6", basePrice: 210 },
  { name: "Marine Plywood, 3/4\"", basePrice: 980 },
  { name: "PVC Electrical Conduit, 20mm", basePrice: 65 },
  { name: "Copper Ground Wire, 8mm", basePrice: 142 },
  { name: "Aluminum Window Frame Section", basePrice: 540 },
  { name: "Ceramic Floor Tile, 60x60cm", basePrice: 940 },
  { name: "Fiberglass Insulation Batt", basePrice: 1150 },
  { name: "Galvanized Steel Angle Bar, 2mm", basePrice: 320 },
  { name: "Exterior Acrylic Paint, Weatherproof", basePrice: 780 },
  { name: "Concrete Hollow Block, 4\"", basePrice: 18 },
];

const REGIONS = ["NCR", "Region I", "Region III", "Region IV-A", "Region VII", "Region XI"];

function seededVariance(seed: number) {
  return ((seed * 9301 + 49297) % 233280) / 233280;
}

const FILLER: DpwhCatalogRow[] = Array.from({ length: 56 }, (_, i) => {
  const material = MATERIALS[i % MATERIALS.length];
  const region = REGIONS[i % REGIONS.length];
  const variance = seededVariance(i + 1);
  const price = Math.round(material.basePrice * (0.92 + variance * 0.16) * 100) / 100;

  return {
    historicalrec_id: 7100 + i,
    item_code: 400 + i,
    item_name: material.name,
    region,
    quarter: "Q1" as const,
    year: 2026,
    price,
  };
});

export const dpwhCatalogFixture: DpwhCatalogRow[] = [...RESOLVED_MATCHES, ...FILLER];
