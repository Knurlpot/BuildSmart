// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Matches Items exactly
// (types/entities/items.ts). Represents the company's own catalog (company_id: 101,
// matching lib/dev/fixtures/company.ts) plus a couple of DPWH reference items (company_id:
// null) — a rule can reasonably prefer either. category_id values match
// lib/dev/fixtures/categories.ts. Backs GET /api/items, the catalog-backed pickers CPRM's
// Material Rules (preferred_item_code) and Unit Rules (item_code) need — see Part B.
import type { Items } from "@/types/entities/items";

export const itemsCatalogFixture: Items[] = [
  { item_code: 5001, category_id: 1, company_id: 101, item_name: "Deformed Steel Rebar, 12mm", material: "Steel", brand: "Generic", unit: "length", item_source: "Internal" },
  { item_code: 5002, category_id: 1, company_id: 101, item_name: "Portland Cement, Type 1", material: "Cement", brand: "Republic", unit: "bag", item_source: "Internal" },
  { item_code: 5003, category_id: 1, company_id: null, item_name: 'Concrete Hollow Block, 6"', material: "Concrete", brand: "DPWH Reference", unit: "piece", item_source: "DPWH" },
  { item_code: 5004, category_id: 2, company_id: 101, item_name: "Ceramic Floor Tile, 60x60cm", material: "Ceramic", brand: "Mariwasa", unit: "piece", item_source: "Internal" },
  { item_code: 5005, category_id: 2, company_id: 101, item_name: "Marine Plywood, 3/4\"", material: "Plywood", brand: "Generic", unit: "sheet", item_source: "Internal" },
  { item_code: 5006, category_id: 3, company_id: 101, item_name: "PVC Electrical Conduit, 20mm", material: "PVC", brand: "Generic", unit: "length", item_source: "Internal" },
  { item_code: 5007, category_id: 3, company_id: 101, item_name: "Circuit Breaker, 20A", material: "Composite", brand: "Schneider", unit: "piece", item_source: "Internal" },
  { item_code: 5008, category_id: 4, company_id: 101, item_name: "Exhaust Fan Unit", material: "Composite", brand: "Generic", unit: "piece", item_source: "Internal" },
  { item_code: 5009, category_id: 5, company_id: 101, item_name: "PPR Pipe, 20mm", material: "PPR", brand: "Generic", unit: "length", item_source: "Internal" },
  { item_code: 5010, category_id: 5, company_id: 101, item_name: "Gate Valve, 1/2\"", material: "Brass", brand: "Generic", unit: "piece", item_source: "Internal" },
  { item_code: 5011, category_id: 6, company_id: 101, item_name: "Exterior Acrylic Paint, Weatherproof", material: "Acrylic", brand: "Boysen", unit: "gallon", item_source: "Internal" },
  { item_code: 5012, category_id: 6, company_id: 101, item_name: "Interior Latex Paint", material: "Latex", brand: "Boysen", unit: "gallon", item_source: "Internal" },
  { item_code: 5013, category_id: 7, company_id: 101, item_name: "Galvanized Steel Angle Bar, 2mm", material: "Steel", brand: "Generic", unit: "length", item_source: "Internal" },
  { item_code: 5014, category_id: 7, company_id: 101, item_name: "Hex Bolt Set", material: "Steel", brand: "Generic", unit: "set", item_source: "Internal" },
  { item_code: 5015, category_id: 8, company_id: 101, item_name: "Temporary Fencing", material: "Composite", brand: "Generic", unit: "length", item_source: "Internal" },
];
