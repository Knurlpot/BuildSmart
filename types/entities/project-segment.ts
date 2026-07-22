export type SegmentSourceMethod = 'Manual' | 'Blueprint' | 'Hybrid';
export type SegmentStatus = 'Active' | 'Removed';

export interface ProjectSegment {
  segment_id: number;
  quote_id: number;
  segment_name: string;
  segment_type: string;
  source_method: SegmentSourceMethod;
  floor_level: string;
  shape_type?: string | null;
  length: number;
  width: number;
  area_sqm: number;
  /** JSON-encoded `[[x, y], ...]` in the source image's pixel space — TEXT column, not a native array/JSON type. Null for manually-entered segments (no blueprint). */
  polygon_coords?: string | null;
  confidence_score?: number | null;
  included_in_quote: boolean;
  scope_of_work: string;
  work_type: string;
  notes?: string | null;
  status: SegmentStatus;
}