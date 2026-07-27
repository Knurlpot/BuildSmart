// PROVISIONAL — shapes with no backing table/column in the consolidated backend schema
// (database_schema.sql, the ground truth for this feature — see CLAUDE.md/the Quotation
// Generation task brief). Each export below documents exactly what's missing and why it's
// modeled here instead of in types/entities/.
//
// NOTE: Client used to live here (schema had no client table at all). That gap is closed —
// the schema now has a real `client` table + `quotation.client_id` FK, so `Client`/
// `ClientType` moved to types/entities/client.ts. Import from there, not here.

// ── Segment treatment type (Step 3 config) ──────────────────────────────────
// project_segments has no treatment_type column in the consolidated schema — flagged
// explicitly in the task brief as "pending a backend re-add." See
// features/quotation-generation/lib/draftSegment.ts's draftSegmentToPayload for exactly
// how (and into which REAL columns) this value gets folded when a segment is submitted.
//
// The task brief assumes this can be "a SELECT from the treatment types the company has
// configured" via Labor Rules — that assumption does NOT hold against this consolidated
// schema: rule_labor is trade-based only (region + labor_trade), with no treatment_type
// column at all (confirmed by reading database_schema.sql directly). There is currently no
// real data source for "the company's configured treatment types," so this is a fixed
// representative list instead, with an "Other" free-text fallback. Flagged in the summary.
export const TREATMENT_TYPES = [
  'Cementitious Waterproofing',
  'Elastomeric Waterproofing',
  'Polyurethane (PU) Waterproofing',
  'Torch-Applied Membrane',
] as const;
export type TreatmentType = (typeof TREATMENT_TYPES)[number];

// ── Blueprint extraction (Path B) ────────────────────────────────────────────
// 100% backend work (Python / Shapely / CV, per the manuscript stack) — the frontend only
// renders whatever segment data comes back. See BlueprintOverlay.tsx for the
// coordinate-system contract this shape exists to support: polygon_coords are in the
// source image's own pixel space, and image_width/image_height travel alongside so an SVG
// viewBox can render them at any display size with no hardcoded positioning.
export interface ExtractedSegment {
  segment_key: string; // staging key for this extraction result — NOT a database id
  segment_name: string;
  polygon_coords: [number, number][];
  area_sqm: number;
  confidence_score: number; // 0-100
}

export interface BlueprintFloor {
  floor_level: string;
  image_url: string;
  image_width: number;
  image_height: number;
  segments: ExtractedSegment[];
}

export interface BlueprintExtractionResult {
  floors: BlueprintFloor[];
}

/** Client-side staging key generator — NEVER a real id, never sent expecting the backend to honor it. */
export function stagingId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
