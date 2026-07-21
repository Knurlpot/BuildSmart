// DraftSegment is a FRONTEND STAGING shape (like usePricelistUpload's ExtractedItemRow) —
// not a table mirror. Nothing here is persisted to project_segments until Step 3's final
// save, once every real AND provisional field is known; see draftSegmentToPayload for
// exactly how (and into which real columns) the provisional fields get folded in.
import type { SegmentConditionTag } from '@/types/entities/segment-tag';
import type { SegmentSourceMethod } from '@/types/entities/project-segment';
import { stagingId, type ExtractedSegment } from '@/lib/dev/provisional/quotationGenerationTypes';

export type SegmentEntryMode = 'dimensions' | 'total_sqm';

// A segment's own source is always cleanly one or the other — 'Hybrid' only describes a
// QUOTATION whose segment set mixes the two (see computeQuotationInputMethod below), even
// though the schema's CHECK on project_segments.source_method technically allows the value
// per row too.
export type DraftSourceMethod = Exclude<SegmentSourceMethod, 'Hybrid'>;

export interface DraftSegment {
  draft_id: string;
  segment_name: string;
  floor_level: string;
  source_method: DraftSourceMethod;
  entry_mode: SegmentEntryMode;
  length: number | null;
  width: number | null;
  area_sqm: number;
  polygon_coords: [number, number][] | null;
  confidence_score: number | null;
  // Review-gate flag for the Blueprint path's "MUST VALIDATE" step — UI-only, never
  // submitted (no schema column, and not a Part-2 concern). Blueprint-detected segments
  // start unconfirmed (something a human has to actually look at); segments the user
  // authored directly (manual add, or the result of grouping) start confirmed since
  // there's nothing "detected" to second-guess.
  confirmed: boolean;
  // Step 3 config — PROVISIONAL, no schema column yet (see quotationGenerationTypes.ts).
  treatment_type: string | null;
  is_rush: boolean;
  condition_tags: SegmentConditionTag[];
  // Maps to the real project_segments.notes column at submit time.
  site_notes: string;
}

export function computeAreaFromDimensions(length: number, width: number): number {
  return Math.round(length * width * 100) / 100;
}

export function createManualSegment(): DraftSegment {
  return {
    draft_id: stagingId('seg'),
    segment_name: '',
    floor_level: '',
    source_method: 'Manual',
    entry_mode: 'total_sqm',
    length: null,
    width: null,
    area_sqm: 0,
    polygon_coords: null,
    confidence_score: null,
    confirmed: true,
    treatment_type: null,
    is_rush: false,
    condition_tags: [],
    site_notes: '',
  };
}

export function createSegmentFromExtraction(extracted: ExtractedSegment, floorLevel: string): DraftSegment {
  return {
    draft_id: stagingId('seg'),
    segment_name: extracted.segment_name,
    floor_level: floorLevel,
    source_method: 'Blueprint',
    entry_mode: 'total_sqm',
    length: null,
    width: null,
    area_sqm: extracted.area_sqm,
    polygon_coords: extracted.polygon_coords,
    confidence_score: extracted.confidence_score,
    confirmed: false,
    treatment_type: null,
    is_rush: false,
    condition_tags: [],
    site_notes: '',
  };
}

/** "Group multiple into one" — sums area, keeps the lowest confidence of the group (the
 * more conservative read), and drops polygon_coords: a merged multi-room shape has no
 * single clean polygon representation and the schema stores exactly one per row. */
export function mergeSegments(segments: DraftSegment[], newName: string): DraftSegment {
  const confidences = segments.map((s) => s.confidence_score).filter((c): c is number => c !== null);
  return {
    draft_id: stagingId('seg'),
    segment_name: newName,
    floor_level: segments[0]?.floor_level ?? '',
    source_method: segments.some((s) => s.source_method === 'Blueprint') ? 'Blueprint' : 'Manual',
    entry_mode: 'total_sqm',
    length: null,
    width: null,
    area_sqm: Math.round(segments.reduce((sum, s) => sum + s.area_sqm, 0) * 100) / 100,
    polygon_coords: null,
    confidence_score: confidences.length > 0 ? Math.min(...confidences) : null,
    // Combining is itself a deliberate, reviewed action — nothing left to second-guess.
    confirmed: true,
    treatment_type: null,
    is_rush: false,
    condition_tags: [],
    site_notes: '',
  };
}

export function isSegmentConfigured(seg: DraftSegment): boolean {
  return !!seg.treatment_type && seg.treatment_type.trim().length > 0;
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
  included_in_quote: true;
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
    length: seg.entry_mode === 'total_sqm' ? seg.area_sqm : (seg.length ?? 0),
    // "Just enter total sqm" convention for the NOT NULL width column: width=1 keeps
    // length * width === area_sqm exactly, rather than fabricating real dimensions.
    width: seg.entry_mode === 'total_sqm' ? 1 : (seg.width ?? 0),
    area_sqm: seg.area_sqm,
    polygon_coords: seg.polygon_coords ? JSON.stringify(seg.polygon_coords) : null,
    confidence_score: seg.confidence_score,
    included_in_quote: true,
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
  if (score >= 90) return 'high';
  if (score >= 70) return 'medium';
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
