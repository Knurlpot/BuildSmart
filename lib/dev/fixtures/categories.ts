// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Matches Category exactly
// (types/entities/category.ts). `category` is a small, fixed, already-confirmed
// reference table (schema v3/v4/v5, unchanged) — one row per CategoryType. Backs
// GET /api/categories, the join CPRM's catalog-backed pickers need to go from a
// CategoryType (what the UI already filters/displays by) to a real category_id (what
// rule_material.category_id / rule_unit.category_id actually store).
import type { Category } from "@/types/entities/category";

export const categoriesFixture: Category[] = [
  { category_id: 1, category_type: "Structural", category_desc: "Structural materials — rebar, cement, CHB, structural steel." },
  { category_id: 2, category_type: "Architectural", category_desc: "Architectural finishes and fixtures — tiles, timber, plywood." },
  { category_id: 3, category_type: "Electrical", category_desc: "Electrical materials — conduit, wiring, breakers." },
  { category_id: 4, category_type: "Mechanical", category_desc: "Mechanical equipment — HVAC, fans, pump assemblies." },
  { category_id: 5, category_type: "Plumbing", category_desc: "Plumbing materials — pipes, fittings, valves." },
  { category_id: 6, category_type: "Finishing", category_desc: "Paints, varnishes, and other finishing materials." },
  { category_id: 7, category_type: "Hardware", category_desc: "Fasteners and general hardware." },
  { category_id: 8, category_type: "Others", category_desc: "Site signage, temporary fencing, safety equipment." },
];
