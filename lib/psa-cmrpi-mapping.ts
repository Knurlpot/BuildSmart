import type { CategoryType } from "@/types/entities/category";

export const PSA_CMRPI_COMMODITY_GROUPS = [
  "ALL ITEMS",
  "Carpentry Materials",
  "Electrical Materials",
  "Masonry Materials",
  "Painting Materials and Related Compounds",
  "Plumbing Materials",
  "Tinsmithry Materials",
  "Miscellaneous Construction Materials",
] as const;

export type PsaCmrpiCommodityGroup = (typeof PSA_CMRPI_COMMODITY_GROUPS)[number];

export type CmrpiMappingResult = {
  commodityGroup: PsaCmrpiCommodityGroup;
  matchType: "Item override" | "Category mapping" | "Fallback";
  reason: string;
};

type ItemOverride = {
  commodityGroup: PsaCmrpiCommodityGroup;
  keywords: string[];
  reason: string;
};

const CATEGORY_TO_CMRPI: Record<CategoryType, PsaCmrpiCommodityGroup> = {
  Structural: "Masonry Materials",
  "Concrete & Masonry": "Masonry Materials",
  "Reinforcement & Steel": "Masonry Materials",
  "Timber & Lumber": "Carpentry Materials",
  Roofing: "Tinsmithry Materials",
  "Insulation & Waterproofing": "Miscellaneous Construction Materials",
  "Masonry Units & Blocks": "Masonry Materials",
  "Doors, Windows & Glazing": "Carpentry Materials",
  Finishing: "Painting Materials and Related Compounds",
  "Flooring & Tiles": "Masonry Materials",
  "Ceilings & Suspended Systems": "Carpentry Materials",
  "Paints, Coatings & Sealants": "Painting Materials and Related Compounds",
  "Plumbing & Pipework": "Plumbing Materials",
  "HVAC & Mechanical": "Miscellaneous Construction Materials",
  "Electrical & Lighting": "Electrical Materials",
  "Hardware & Fasteners": "Miscellaneous Construction Materials",
  "Adhesives & Tapes": "Miscellaneous Construction Materials",
  "Tools, Equipment & Consumables": "Miscellaneous Construction Materials",
  "Safety & PPE": "Miscellaneous Construction Materials",
  "Landscaping & Siteworks": "Miscellaneous Construction Materials",
  "Specialty Materials & Systems": "Miscellaneous Construction Materials",
  Others: "ALL ITEMS",
};

const ITEM_OVERRIDES: ItemOverride[] = [
  {
    commodityGroup: "Masonry Materials",
    keywords: ["cement", "concrete", "hollow block", "chb", "aggregate", "sand", "gravel", "mortar", "rebar", "deformed bar", "steel bar"],
    reason: "Concrete, masonry, and reinforcement items follow PSA masonry movement.",
  },
  {
    commodityGroup: "Carpentry Materials",
    keywords: ["plywood", "lumber", "wood", "timber", "formworks", "formwork", "door", "jamb", "panel board"],
    reason: "Wood, formwork, doors, and related finish carpentry follow PSA carpentry movement.",
  },
  {
    commodityGroup: "Electrical Materials",
    keywords: ["wire", "cable", "conduit", "breaker", "switch", "outlet", "panelboard", "lighting", "lamp", "led"],
    reason: "Electrical distribution and lighting items follow PSA electrical movement.",
  },
  {
    commodityGroup: "Painting Materials and Related Compounds",
    keywords: ["paint", "primer", "sealer", "skim coat", "putty", "sealant", "caulk", "epoxy"],
    reason: "Paints, coatings, sealers, and related compounds follow PSA painting movement.",
  },
  {
    commodityGroup: "Plumbing Materials",
    keywords: ["pipe", "pvc", "ppr", "hdpe", "fitting", "elbow", "tee", "valve", "faucet", "water closet", "lavatory"],
    reason: "Pipes, fittings, valves, and sanitary fixtures follow PSA plumbing movement.",
  },
  {
    commodityGroup: "Tinsmithry Materials",
    keywords: ["roof", "gutter", "flashing", "downspout", "spandrel", "gi sheet", "metal sheet", "rib type", "corrugated"],
    reason: "Roofing sheet-metal, gutters, flashing, and tinsmithry items follow PSA tinsmithry movement.",
  },
];

function normalize(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCategoryType(value?: string | null): value is CategoryType {
  return Object.prototype.hasOwnProperty.call(CATEGORY_TO_CMRPI, value ?? "");
}

export function mapToPsaCmrpiCommodityGroup(input: {
  itemName?: string | null;
  material?: string | null;
  category?: string | null;
}): CmrpiMappingResult {
  const searchable = normalize([input.itemName, input.material].filter(Boolean).join(" "));

  for (const override of ITEM_OVERRIDES) {
    if (override.keywords.some((keyword) => searchable.includes(normalize(keyword)))) {
      return {
        commodityGroup: override.commodityGroup,
        matchType: "Item override",
        reason: override.reason,
      };
    }
  }

  if (isCategoryType(input.category)) {
    return {
      commodityGroup: CATEGORY_TO_CMRPI[input.category],
      matchType: "Category mapping",
      reason: `${input.category} maps to PSA CMRPI ${CATEGORY_TO_CMRPI[input.category]}.`,
    };
  }

  return {
    commodityGroup: "ALL ITEMS",
    matchType: "Fallback",
    reason: "No item override or BuildSmart category mapping matched; using PSA all-items movement.",
  };
}
