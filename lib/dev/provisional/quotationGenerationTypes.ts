export interface ExtractedSegment {
  segment_name: string;
  area_sqm: number;
  polygon_coords: [number, number][] | null;
  confidence_score: number | null;
  geometry_flagged: boolean;
  geometry_warnings: string[];
  boundary_estimated: boolean;
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
  diagnostics?: Record<string, unknown> | null;
  blueprint_file_path?: string | null;
  persistence_enabled?: boolean;
  persistence_warning?: string | null;
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
