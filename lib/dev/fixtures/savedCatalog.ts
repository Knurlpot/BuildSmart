// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Backs GET /api/pricelist/catalog.
// Matches SavedPriceRecord exactly (hooks/usePricelistCatalog.ts). Plain saved rows only —
// no variance/change flags, since re-upload and diff behavior are unconfirmed.
import type { SavedPriceRecord } from "@/hooks/usePricelistCatalog";

export const savedCatalogFixture: SavedPriceRecord[] = [
  {
    historicalrec_id: 9001,
    item_code: 300,
    description: "Galvanized Roofing Sheet, Gauge 26 — Standard",
    unit: "m²",
    price: 604.72,
    region: "NCR",
    source: "Supplier Upload",
    recorded_at: "2026-01-08T00:00:00.000Z",
  },
  {
    historicalrec_id: 9002,
    item_code: 301,
    description: "Reinforced Concrete Hollow Block, 6\" — Heavy-Duty",
    unit: "pc",
    price: 21.72,
    region: "Region I",
    source: "Supplier Upload",
    recorded_at: "2026-01-09T00:00:00.000Z",
  },
  {
    historicalrec_id: 9003,
    item_code: 302,
    description: "Deformed Steel Rebar, 12mm — Premium Grade",
    unit: "kg",
    price: 57.96,
    region: "Region III",
    source: "Supplier Upload",
    recorded_at: "2026-01-10T00:00:00.000Z",
  },
  {
    historicalrec_id: 9004,
    item_code: 303,
    description: "Exterior Acrylic Paint, Weatherproof — Industrial",
    unit: "gal",
    price: 788.77,
    region: "Region IV-A",
    source: "Supplier Upload",
    recorded_at: "2026-01-11T00:00:00.000Z",
  },
  {
    historicalrec_id: 9005,
    item_code: 304,
    description: "PVC Electrical Conduit, 20mm — Economy",
    unit: "pc",
    price: 66.51,
    region: "Region VII",
    source: "Supplier Upload",
    recorded_at: "2026-01-12T00:00:00.000Z",
  },
];
