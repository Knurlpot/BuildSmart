// PROVISIONAL — shapes with no backing table/column in the consolidated backend schema
// (database_schema.sql, the ground truth for this feature — see CLAUDE.md/the Quotation
// Generation task brief). Each export below documents exactly what's missing and why it's
// modeled here instead of in types/entities/.

// ── Client ────────────────────────────────────────────────────────────────
// The schema has NO client table at all, and `quotation` has no client_id FK — quotation
// only references company_id (the CONTRACTOR's own company) and user_id (the estimator
// account). "Select an existing client, or create new" is a real Step 1 requirement, so
// this is built as fully local/provisional: selecting or creating a client only drives
// wizard display state (e.g. a "Quoting for: X" header) and is NEVER sent as part of the
// real quotation-creation payload, since there is nowhere on the real `quotation` row to
// put it.
// ⚠️ SCHEMA GAP, not worked around: the backend needs a `client` table (+ a
// `quotation.client_id` FK, or equivalent) before a client selection can actually persist
// against a quotation. Flagged in the task summary.
export interface Client {
  client_id: string; // staging id (see stagingId()) — NEVER a real database id
  client_name: string;
  contact_number?: string | null;
  contact_email?: string | null;
}

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
