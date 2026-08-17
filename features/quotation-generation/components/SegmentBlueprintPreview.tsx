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

export function SegmentBlueprintPreview({ floors, segments, hoveredId, onHoverChange }: SegmentBlueprintPreviewProps) {
  const [selectedFloor, setSelectedFloor] = useState(floors[0]?.floor_level ?? "");
  const currentFloor = floors.find((f) => f.floor_level === selectedFloor) ?? floors[0];
  const floorSegments = segments.filter((s) => s.floor_level === currentFloor.floor_level && s.polygon_coords);

  return (
    <div className="flex flex-col gap-3">
      {floors.length > 1 && (
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
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
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600">
        {currentFloor.floor_level} · {floorSegments.length} segment{floorSegments.length === 1 ? "" : "s"}
      </div>
      <BlueprintOverlay
        key={currentFloor.floor_level}
        imageUrl={currentFloor.image_url}
        imageWidth={currentFloor.image_width}
        imageHeight={currentFloor.image_height}
        focusBounds={currentFloor.focus_bounds}
        segments={floorSegments}
        hoveredId={hoveredId}
        onHoverChange={onHoverChange}
        readOnly
      />
    </div>
  );
}
