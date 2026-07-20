"use client";

import { confidenceBand, type DraftSegment } from "../lib/draftSegment";

const BAND_COLOR: Record<ReturnType<typeof confidenceBand>, string> = {
  high: "#16a34a", // green — confidence >= 90
  medium: "#d97706", // amber — 70-89
  low: "#dc2626", // red — < 70
  none: "#6b7280",
};

interface BlueprintOverlayProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  /** Already filtered to this floor's segments that still have a polygon (a merged/grouped
   * segment has none — see draftSegment.ts's mergeSegments). */
  segments: DraftSegment[];
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
}

// ‼️ COORDINATE-SYSTEM CONTRACT — the one hard requirement of this component.
//
// The frontend does NOT detect rooms, compute areas, or infer shapes from the blueprint
// image — that is 100% backend work (Python / Shapely / CV, per the manuscript stack).
// This component's only job is to RENDER coordinates the backend already computed: it
// plots polygon_coords, which are in the source image's own pixel space, over that same
// image, using an SVG `viewBox` sized to the image's intrinsic width/height. Because SVG
// scales by viewBox, every polygon aligns to the blueprint at ANY display size,
// automatically and exactly — nothing here hardcodes a pixel position, and none of it
// changes when a real extraction endpoint replaces the dev-mock fixture: same data shape
// in (BlueprintFloor from lib/dev/provisional/quotationGenerationTypes.ts), same
// rendering out.
export function BlueprintOverlay({ imageUrl, imageWidth, imageHeight, segments, hoveredId, onHoverChange }: BlueprintOverlayProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
      <svg viewBox={`0 0 ${imageWidth} ${imageHeight}`} className="block h-auto w-full">
        <image href={imageUrl} x={0} y={0} width={imageWidth} height={imageHeight} />
        {segments.map((seg) => {
          if (!seg.polygon_coords) return null;
          const color = BAND_COLOR[confidenceBand(seg.confidence_score)];
          const isHovered = hoveredId === seg.draft_id;
          return (
            <polygon
              key={seg.draft_id}
              points={seg.polygon_coords.map(([x, y]) => `${x},${y}`).join(" ")}
              fill={color}
              fillOpacity={isHovered ? 0.4 : 0.2}
              stroke={color}
              strokeWidth={isHovered ? 6 : 3}
              className="cursor-pointer transition-[fill-opacity,stroke-width]"
              onMouseEnter={() => onHoverChange(seg.draft_id)}
              onMouseLeave={() => onHoverChange(null)}
            >
              {/* Native browser tooltip — "Living Room — 25.1 sqm · 95%" */}
              <title>
                {seg.segment_name} — {seg.area_sqm.toFixed(1)} sqm · {seg.confidence_score}%
              </title>
            </polygon>
          );
        })}
      </svg>
    </div>
  );
}
