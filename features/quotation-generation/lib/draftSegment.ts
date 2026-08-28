// DraftSegment is a FRONTEND STAGING shape (like usePricelistUpload's ExtractedItemRow) —
// not a table mirror. Nothing here is persisted to project_segments until Step 3's final
// save, once every real AND provisional field is known; see draftSegmentToPayload for
// exactly how (and into which real columns) the provisional fields get folded in.
import type { SegmentConditionTag } from '@/types/entities/segment-tag';
import type { SegmentSourceMethod } from '@/types/entities/project-segment';
import { stagingId, type ExtractedSegment } from '@/lib/dev/provisional/quotationGenerationTypes';

// 'dimensions' = Length × Width (rectangle). 'l_shape' = overall rectangle minus a notch
// (overall_length × overall_width − notch_length × notch_width). 'running_meter' = a linear
// length (parapets/edges) — not really an area, but folded into area_sqm the same way total
// sqm is; see draftSegmentToPayload's comment on why this is the least-lossy option given the
// schema has no separate "linear meters" column.
export type SegmentEntryMode = 'dimensions' | 'total_sqm' | 'l_shape' | 'running_meter';
export type LaborBasis = 'Auto' | 'Treatment' | 'Trade' | 'General';

// A segment's own source is always cleanly one or the other — 'Hybrid' only describes a
// QUOTATION whose segment set mixes the two (see computeQuotationInputMethod below), even
// though the schema's CHECK on project_segments.source_method technically allows the value
// per row too.
export type DraftSourceMethod = Exclude<SegmentSourceMethod, 'Hybrid'>;
export type SegmentPolygon = [number, number][];

export interface DraftSegment {
  draft_id: string;
  segment_name: string;
  floor_level: string;
  source_method: DraftSourceMethod;
  entry_mode: SegmentEntryMode;
  // 'dimensions': a real rectangle length/width. 'running_meter': length doubles as the
  // linear measurement itself (width stays null). Null in every other mode.
  length: number | null;
  width: number | null;
  // 'l_shape' only — the schema has no columns for these 4 numbers, so they live here
  // purely as staging state; only the computed area_sqm survives to the real payload.
  overall_length: number | null;
  overall_width: number | null;
  notch_length: number | null;
  notch_width: number | null;
  area_sqm: number;
  polygon_coords: SegmentPolygon | null;
  // Grouped blueprint segments can contain several separate room outlines. The database
  // currently accepts one polygon string, so this is staging/UI-only until persistence
  // grows a real multi-polygon column.
  polygon_groups: SegmentPolygon[] | null;
  confidence_score: number | null;
  geometry_flagged: boolean;
  geometry_warnings: string[];
  boundary_estimated: boolean;
  // Review-gate flag for the Blueprint path's "MUST VALIDATE" step — UI-only, never
  // submitted (no schema column, and not a Part-2 concern). Blueprint-detected segments
  // start unconfirmed (something a human has to actually look at); segments the user
  // authored directly (manual add, or the result of grouping) start confirmed since
  // there's nothing "detected" to second-guess.
  confirmed: boolean;
  // Maps to the real project_segments.included_in_quote column. A specialty contractor
  // may only want SOME detected rooms priced (e.g. tiling only quotes the bathroom/
  // kitchen) — excluding a segment here does NOT delete it (the room is real; it's just
  // out of scope for this quote). Defaults true everywhere a segment is created: nothing
  // is silently left out until a human explicitly excludes it.
  included_in_quote: boolean;
  // Step 3 config — PROVISIONAL, no schema column yet (see quotationGenerationTypes.ts).
  treatment_type: string | null;
  labor_basis: LaborBasis;
  labor_trade: string | null;
  is_rush: boolean;
  condition_tags: SegmentConditionTag[];
  // Maps to the real project_segments.notes column at submit time.
  site_notes: string;
}

export function computeAreaFromDimensions(length: number, width: number): number {
  return Math.round(length * width * 100) / 100;
}

/** Overall rectangle minus a notch, clamped at 0 — a notch that (mistakenly) exceeds the
 * overall dimensions can't produce a negative area. */
export function computeAreaFromLShape(overallLength: number, overallWidth: number, notchLength: number, notchWidth: number): number {
  const area = overallLength * overallWidth - notchLength * notchWidth;
  return Math.round(Math.max(0, area) * 100) / 100;
}

export const SEGMENT_ENTRY_MODE_LABEL: Record<SegmentEntryMode, string> = {
  total_sqm: 'Total sqm',
  dimensions: 'Length × Width',
  l_shape: 'L-Shaped',
  running_meter: 'Running Meter',
};

/** True once a segment has a usable, non-zero area — the one real validity gate (Part E):
 * no 0-area segment counts toward the running total or satisfies "at least one segment". */
export function isSegmentAreaValid(seg: DraftSegment): boolean {
  return seg.area_sqm > 0;
}

/** Segments the user has chosen to keep in THIS quote's scope — excluded segments stay in
 * the list (still detected, still real) but don't count toward validation/totals gates. */
export function isSegmentIncluded(seg: DraftSegment): boolean {
  return seg.included_in_quote;
}

const SHAPE_FIELD_DEFAULTS = {
  length: null,
  width: null,
  overall_length: null,
  overall_width: null,
  notch_length: null,
  notch_width: null,
} as const;

/** `defaultName` lets callers pre-fill "Segment 1", "Segment 2"... (Part E: no segment is
 * ever left nameless) while the user can still rename it inline. */
export function createManualSegment(defaultName = ''): DraftSegment {
  return {
    draft_id: stagingId('seg'),
    segment_name: defaultName,
    floor_level: '',
    source_method: 'Manual',
    entry_mode: 'total_sqm',
    ...SHAPE_FIELD_DEFAULTS,
    area_sqm: 0,
    polygon_coords: null,
    polygon_groups: null,
    confidence_score: null,
    geometry_flagged: false,
    geometry_warnings: [],
    boundary_estimated: false,
    confirmed: true,
    included_in_quote: true,
    treatment_type: null,
    labor_basis: 'Auto',
    labor_trade: null,
    is_rush: false,
    condition_tags: [],
    site_notes: '',
  };
}

export function createSegmentFromExtraction(extracted: ExtractedSegment, floorLevel: string): DraftSegment {
  const safeArea = Number.isFinite(extracted.area_sqm) && extracted.area_sqm > 0 ? extracted.area_sqm : 0;
  return {
    draft_id: stagingId('seg'),
    segment_name: extracted.segment_name,
    floor_level: floorLevel,
    source_method: 'Blueprint',
    entry_mode: 'total_sqm',
    ...SHAPE_FIELD_DEFAULTS,
    area_sqm: safeArea,
    polygon_coords: extracted.polygon_coords,
    polygon_groups: extracted.polygon_coords ? [extracted.polygon_coords] : null,
    confidence_score: extracted.confidence_score,
    geometry_flagged: extracted.geometry_flagged,
    geometry_warnings: extracted.geometry_warnings,
    boundary_estimated: extracted.boundary_estimated,
    confirmed: false,
    included_in_quote: true,
    treatment_type: null,
    labor_basis: 'Auto',
    labor_trade: null,
    is_rush: false,
    condition_tags: [],
    site_notes: '',
  };
}

function segmentPolygons(seg: DraftSegment): SegmentPolygon[] {
  if (seg.polygon_groups?.length) return seg.polygon_groups;
  return seg.polygon_coords ? [seg.polygon_coords] : [];
}

/** "Group multiple into one" — sums area, keeps the lowest confidence of the group (the
 * more conservative read), and preserves each source room outline as a multi-polygon
 * staging shape so the blueprint highlight does not disappear after grouping. */
export function mergeSegments(segments: DraftSegment[], newName: string): DraftSegment {
  const confidences = segments.map((s) => s.confidence_score).filter((c): c is number => c !== null);
  const polygonGroups = segments.flatMap(segmentPolygons);
  return {
    draft_id: stagingId('seg'),
    segment_name: newName,
    floor_level: segments[0]?.floor_level ?? '',
    source_method: segments.some((s) => s.source_method === 'Blueprint') ? 'Blueprint' : 'Manual',
    entry_mode: 'total_sqm',
    ...SHAPE_FIELD_DEFAULTS,
    area_sqm: Math.round(segments.reduce((sum, s) => sum + s.area_sqm, 0) * 100) / 100,
    polygon_coords: polygonGroups[0] ?? null,
    polygon_groups: polygonGroups.length > 0 ? polygonGroups : null,
    confidence_score: confidences.length > 0 ? Math.min(...confidences) : null,
    geometry_flagged: segments.some((segment) => segment.geometry_flagged),
    geometry_warnings: [...new Set(segments.flatMap((segment) => segment.geometry_warnings))],
    boundary_estimated: segments.some((segment) => segment.boundary_estimated),
    // Combining is itself a deliberate, reviewed action — nothing left to second-guess.
    confirmed: true,
    // Grouping only offers segments already in scope (see the Part F selection UI) — the
    // merged result stays included.
    included_in_quote: true,
    treatment_type: null,
    labor_basis: 'Auto',
    labor_trade: null,
    is_rush: false,
    condition_tags: [],
    site_notes: '',
  };
}

export function isSegmentConfigured(seg: DraftSegment): boolean {
  const treatmentConfigured = !!seg.treatment_type && seg.treatment_type.trim().length > 0;
  const laborConfigured = seg.labor_basis !== 'Trade' || !!seg.labor_trade?.trim();
  return treatmentConfigured && laborConfigured;
}

export interface ProjectSegmentPayload {
  segment_name: string;
  segment_type: string;
  source_method: DraftSourceMethod;
  floor_level: string;
  shape_type: null;
  length: number;
  width: number;
  area_sqm: number;
  polygon_coords: string | null;
  confidence_score: number | null;
  included_in_quote: boolean;
  scope_of_work: string;
  work_type: string;
  notes: string | null;
}

const DEFAULT_FLOOR_LEVEL = 'Ground Floor';
const UNSPECIFIED_TREATMENT_LABEL = 'Not specified';

// Centralizes every "the schema requires a value here but Part 1's spec doesn't collect
// one" assumption in ONE place, each commented, rather than scattered across components —
// see the task summary for the same list restated.
export function draftSegmentToPayload(seg: DraftSegment): ProjectSegmentPayload {
  const treatment = seg.treatment_type?.trim() || UNSPECIFIED_TREATMENT_LABEL;
  return {
    segment_name: seg.segment_name,
    // NOT NULL, no CHECK enum in the schema, and no dedicated UI field in Part 1's spec —
    // defaulted to segment_name until backend/product defines distinct segment_type values.
    segment_type: seg.segment_name,
    source_method: seg.source_method,
    // NOT NULL, but the task explicitly wants this optional in the UI.
    floor_level: seg.floor_level.trim() || DEFAULT_FLOOR_LEVEL,
    shape_type: null,
    // Only 'dimensions' (a plain rectangle) has real length/width to store. Every other
    // mode — total_sqm, l_shape (the schema has no columns for the 4 numbers that go into
    // overall-minus-notch), and running_meter (a linear count, not an area) — folds into
    // the NOT NULL length/width columns the same way: length=area_sqm, width=1, so
    // length*width===area_sqm stays true and nothing beyond "this is the area" is invented.
    length: seg.entry_mode === 'dimensions' ? (seg.length ?? 0) : seg.area_sqm,
    width: seg.entry_mode === 'dimensions' ? (seg.width ?? 0) : 1,
    area_sqm: seg.area_sqm,
    polygon_coords: seg.polygon_groups?.[0] ? JSON.stringify(seg.polygon_groups[0]) : seg.polygon_coords ? JSON.stringify(seg.polygon_coords) : null,
    confidence_score: seg.confidence_score,
    // Part F — a specialty contractor may only want SOME detected rooms priced. Excluded
    // segments still submit as real rows (the room was genuinely detected/measured); this
    // is the ONLY thing that changes for them, never their presence in the payload.
    included_in_quote: seg.included_in_quote,
    // scope_of_work/work_type are both NOT NULL with no CHECK enum and no distinct UI
    // field in Part 1's spec — mapped from treatment_type (the only segment-level
    // classification Part 1 collects) until backend clarifies whether they're meant to
    // diverge.
    scope_of_work: treatment,
    work_type: treatment,
    notes: seg.site_notes.trim() || null,
  };
}

export function computeQuotationInputMethod(segments: DraftSegment[]): 'Manual' | 'Blueprint' | 'Hybrid' {
  const methods = new Set(segments.map((s) => s.source_method));
  if (methods.size > 1) return 'Hybrid';
  return methods.has('Blueprint') ? 'Blueprint' : 'Manual';
}

export function confidenceBand(score: number | null): 'high' | 'medium' | 'low' | 'none' {
  if (score === null) return 'none';
  if (score >= 85) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

export const CONFIDENCE_BAND_LABEL: Record<ReturnType<typeof confidenceBand>, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'Unknown',
};

/** Simple average-of-vertices centroid — good enough to order the scan animation's
 * top-to-bottom polygon reveal in BlueprintOverlay.tsx; not used for anything geometric. */
export function polygonCentroidY(coords: [number, number][]): number {
  return coords.reduce((sum, [, y]) => sum + y, 0) / coords.length;
}
