"use client";

// Task 7, Part B — Segment Breakdown's split-view left half. A THIN floor-tab wrapper
// around BlueprintOverlay (mirrors BlueprintUploadPanel's floor-tab glue from Review
// Segments, step 3), WITHOUT that step's editing chrome (SegmentEditorList, upload
// dropzone, rescan). BlueprintOverlay itself is reused exactly, in readOnly mode — this is
// not a new blueprint renderer, just a smaller caller of the existing one. Same viewBox/
// real-coords contract; nothing here computes or infers anything client-side.
import { useState } from "react";
import { BlueprintOverlay } from "./BlueprintOverlay";
import type { DraftSegment } from "../lib/draftSegment";
import type { BlueprintFloor } from "@/lib/dev/provisional/quotationGenerationTypes";

interface SegmentBlueprintPreviewProps {
  floors: BlueprintFloor[];
  segments: DraftSegment[];
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
}

function isFullSheetBounds(bounds: [number, number, number, number] | null | undefined, imageWidth: number, imageHeight: number): boolean {
  if (!bounds) return true;
  const [minX, minY, maxX, maxY] = bounds;
  return minX <= imageWidth * 0.02 && minY <= imageHeight * 0.02 && maxX >= imageWidth * 0.98 && maxY >= imageHeight * 0.98;
}

function displayBoundsForFloor(floors: BlueprintFloor[], floor: BlueprintFloor): [number, number, number, number] | null {
  const explicitBounds = floor.viewport_bbox ?? floor.focus_bounds ?? null;
  const sameImageFloors = floors.filter(
    (candidate) =>
      candidate.image_url === floor.image_url &&
      candidate.image_width === floor.image_width &&
      candidate.image_height === floor.image_height,
  );
  if (sameImageFloors.length < 2) return explicitBounds;
  if (!isFullSheetBounds(explicitBounds, floor.image_width, floor.image_height)) return explicitBounds;

  const index = sameImageFloors.findIndex((candidate) => candidate.floor_level === floor.floor_level);
  const lowerName = floor.floor_level.toLowerCase();
  if (lowerName.includes("ground")) return [0, 0, floor.image_width / 2, floor.image_height];
  if (lowerName.includes("second") || lowerName.includes("upper") || index === 1) return [floor.image_width / 2, 0, floor.image_width, floor.image_height];
  if (index > 1) return null;
  return index === 0 ? [0, 0, floor.image_width / 2, floor.image_height] : [floor.image_width / 2, 0, floor.image_width, floor.image_height];
}

export function SegmentBlueprintPreview({ floors, segments, hoveredId, onHoverChange }: SegmentBlueprintPreviewProps) {
  const [selectedFloor, setSelectedFloor] = useState(floors[0]?.floor_level ?? "");
  const currentFloor = floors.find((f) => f.floor_level === selectedFloor) ?? floors[0];
  const floorSegments = segments.filter((s) => s.floor_level === currentFloor.floor_level && (s.polygon_coords || s.polygon_groups?.length));
  const selectedPoints = floorSegments.flatMap((segment) => segment.polygon_groups?.length ? segment.polygon_groups.flat() : (segment.polygon_coords ?? []));
  const selectedGeometryBounds = selectedPoints.length > 0
    ? selectedPoints.reduce<[number, number, number, number]>(
        ([minX, minY, maxX, maxY], [x, y]) => [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)],
        [selectedPoints[0][0], selectedPoints[0][1], selectedPoints[0][0], selectedPoints[0][1]],
      )
    : null;
  const floorVisibleBounds = selectedGeometryBounds ?? displayBoundsForFloor(floors, currentFloor);

  return (
    <div>
      {floors.length > 1 && (
        <div className="hidden">
          {floors.map((f) => (
            <button
              key={f.floor_level}
              type="button"
              onClick={() => setSelectedFloor(f.floor_level)}
              className={`shrink-0 rounded-md px-4 py-1.5 text-xs font-semibold transition ${
                f.floor_level === currentFloor.floor_level ? "bg-primary text-primary-foreground" : "text-gray-500 hover:bg-gray-50"
              }`}
              title={`${f.floor_level} · ${f.segments.length} segment${f.segments.length === 1 ? "" : "s"}`}
            >
              {f.floor_level}
              <span className="ml-2 opacity-75">{f.segments.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="hidden">
        {currentFloor.floor_level} · {floorSegments.length} segment{floorSegments.length === 1 ? "" : "s"}
      </div>
      <BlueprintOverlay
        key={currentFloor.floor_level}
        imageUrl={currentFloor.image_url}
        imageWidth={currentFloor.image_width}
        imageHeight={currentFloor.image_height}
        focusBounds={floorVisibleBounds}
        segments={floorSegments}
        hoveredId={hoveredId}
        onHoverChange={onHoverChange}
        topLeftOverlay={
          floors.length > 1 ? (
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur-sm">
              {floors.map((f) => (
                <button
                  key={f.floor_level}
                  type="button"
                  onClick={() => setSelectedFloor(f.floor_level)}
                  className={`shrink-0 rounded-md px-3 py-1 text-[11px] font-semibold transition ${
                    f.floor_level === currentFloor.floor_level ? "bg-primary text-primary-foreground" : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {f.floor_level}<span className="ml-1.5 opacity-75">{f.segments.length}</span>
                </button>
              ))}
            </div>
          ) : null
        }
        readOnly
      />
    </div>
  );
}
