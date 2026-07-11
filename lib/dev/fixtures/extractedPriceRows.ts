// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Backs POST /api/pricelist/upload.
// Matches DetectedColumn, ExtractedItemRow, and ExtractedSupplierRow exactly
// (hooks/usePricelistUpload.ts), same field casing. Models a two-file upload — an item
// pricelist + a supplier info file — pooled into one column set, per Part B/A of the
// Pricelist Management revision.
import type { DetectedColumn, ExtractedItemRow, ExtractedSupplierRow } from "@/hooks/usePricelistUpload";

const MATERIALS: { name: string; material: string; brand: string; unit: string; categoryId: number; basePrice: number }[] = [
  { name: "Galvanized Roofing Sheet, Gauge 26", material: "Galvanized Steel", brand: "MetalCraft", unit: "m²", categoryId: 1, basePrice: 620 },
  { name: "Reinforced Concrete Hollow Block, 6\"", material: "Concrete", brand: "SolidBlock", unit: "pc", categoryId: 1, basePrice: 22 },
  { name: "Deformed Steel Rebar, 12mm", material: "Steel", brand: "IronPeak", unit: "kg", categoryId: 1, basePrice: 58 },
  { name: "Exterior Acrylic Paint, Weatherproof", material: "Acrylic Coating", brand: "ColorGuard", unit: "gal", categoryId: 6, basePrice: 780 },
  { name: "PVC Electrical Conduit, 20mm", material: "PVC", brand: "CircuitLine", unit: "pc", categoryId: 3, basePrice: 65 },
  { name: "Copper Plumbing Fitting, Elbow 1/2\"", material: "Copper", brand: "FlowFit", unit: "pc", categoryId: 5, basePrice: 48 },
  { name: "Ceramic Floor Tile, 60x60cm", material: "Ceramic", brand: "TerraTile", unit: "box", categoryId: 2, basePrice: 940 },
  { name: "Tempered Glass Panel, 10mm", material: "Tempered Glass", brand: "ClearSpan", unit: "m²", categoryId: 2, basePrice: 3200 },
  { name: "Kiln-dried Timber Plank, 2x6", material: "Timber", brand: "WoodCraft", unit: "lm", categoryId: 2, basePrice: 210 },
  { name: "Fiberglass Insulation Batt", material: "Fiberglass", brand: "ThermaWrap", unit: "roll", categoryId: 6, basePrice: 1150 },
  { name: "Portland Cement, Type 1", material: "Cement", brand: "RockSet", unit: "bag", categoryId: 1, basePrice: 265 },
  { name: "Aluminum Window Frame Section", material: "Aluminum", brand: "FrameWorks", unit: "lm", categoryId: 2, basePrice: 540 },
];

function seededVariance(seed: number) {
  // Deterministic pseudo-variance so the fixture is stable across renders/builds.
  return ((seed * 9301 + 49297) % 233280) / 233280;
}

export const detectedColumnsFixture: DetectedColumn[] = [
  { raw_column: "Item Name", mapped_field: "item_name", source_files: ["item_pricelist.csv"] },
  { raw_column: "Material", mapped_field: "material", source_files: ["item_pricelist.csv"] },
  { raw_column: "Brand", mapped_field: "brand", source_files: ["item_pricelist.csv"] },
  { raw_column: "Unit", mapped_field: "unit", source_files: ["item_pricelist.csv"] },
  { raw_column: "Category", mapped_field: "category_id", source_files: ["item_pricelist.csv"] },
  { raw_column: "Unit Price", mapped_field: "price", source_files: ["item_pricelist.csv"] },
  { raw_column: "Internal Notes", mapped_field: null, source_files: ["item_pricelist.csv"] },
  { raw_column: "Vendor Name", mapped_field: "supplier_name", source_files: ["supplier_info.csv"] },
  { raw_column: "Address", mapped_field: "supplier_address", source_files: ["supplier_info.csv"] },
  { raw_column: "City", mapped_field: "city", source_files: ["supplier_info.csv"] },
  { raw_column: "Region", mapped_field: "region", source_files: ["supplier_info.csv"] },
  { raw_column: "Email", mapped_field: "contact_email", source_files: ["supplier_info.csv"] },
  { raw_column: "Phone", mapped_field: "contact_number", source_files: ["supplier_info.csv"] },
  { raw_column: "Vendor Type", mapped_field: "supplier_type", source_files: ["supplier_info.csv"] },
];

export const extractedItemRowsFixture: ExtractedItemRow[] = Array.from({ length: 118 }, (_, i) => {
  const material = MATERIALS[i % MATERIALS.length];
  const variance = seededVariance(i + 1);
  const price = Math.round(material.basePrice * (0.9 + variance * 0.3) * 100) / 100;
  // No column was mapped to Category for every 9th row — demonstrates a genuinely missing
  // required field distinct from item_source, which has no mapped column for ANY row here
  // (no file supplied one) and simply defaults to 'Supplier' — see usePricelistUpload.ts.
  const needsMapping = i % 9 === 0;
  const dayOfMonth = 1 + (i % 27);

  return {
    row_key: `staged-item-${i + 1}`,
    item_name: material.name,
    material: material.material,
    brand: material.brand,
    unit: material.unit,
    category_id: needsMapping ? null : material.categoryId,
    item_source: "Supplier",
    price,
    recorded_at: `2026-01-${String(dayOfMonth).padStart(2, "0")}T00:00:00.000Z`,
    needs_mapping: needsMapping,
  };
});

export const extractedSupplierRowsFixture: ExtractedSupplierRow[] = [
  {
    row_key: "staged-supplier-1",
    supplier_name: "Metro Construction Supply Corp.",
    supplier_address: "88 Industrial Ave, Valenzuela City",
    city: "Valenzuela",
    region: "NCR",
    contact_email: "sales@metroconstructionsupply.example",
    contact_number: "+63 917 555 0199",
    supplier_type: "Distributor",
    warehouse_loc: "Valenzuela Warehouse Complex, Bldg 4",
    needs_mapping: false,
  },
];
