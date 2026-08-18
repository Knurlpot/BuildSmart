export interface ExtractedSegment {
  segment_id?: string | null;
  segment_name: string;
  area_sqm: number;
  perimeter_m?: number | null;
  category?: string | null;
  color_hex?: string | null;
  alpha?: number | null;
  polygon_coords: [number, number][] | null;
  confidence_score: number | null;
  geometry_flagged: boolean;
  geometry_warnings: string[];
  boundary_estimated: boolean;
  status?: string;
}

export interface BlueprintFloor {
  floor_id?: number | null;
  floor_level: string;
  floor_name?: string | null;
  image_url: string;
  image_width: number;
  image_height: number;
  focus_bounds?: [number, number, number, number] | null;
  viewport_bbox?: [number, number, number, number] | null;
  segments: ExtractedSegment[];
  confidence_buckets?: {
    high_confidence: ExtractedSegment[];
    medium_confidence: ExtractedSegment[];
    low_confidence: ExtractedSegment[];
    uncertain: ExtractedSegment[];
  };
  review_required?: boolean;
}

export interface BlueprintExtractionResult {
  floors: BlueprintFloor[];
  diagnostics?: Record<string, unknown> | null;
  blueprint_file_path?: string | null;
  persistence_enabled?: boolean;
  persistence_warning?: string | null;
  structured_json?: Record<string, unknown> | null;
}

export const TREATMENT_TYPES = [
  'Waterproofing',
  'Plastering',
  'Painting',
  'Tile Work',
  'Rendering',
] as const;

let nextId = 0;

export function stagingId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}
