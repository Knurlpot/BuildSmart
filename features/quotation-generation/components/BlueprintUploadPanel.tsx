"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCheck, FileWarning, Upload as UploadIcon } from "lucide-react";
import { useBlueprintExtraction } from "@/hooks/useQuotationGeneration";
import { BlueprintOverlay } from "./BlueprintOverlay";
import { SegmentEditorList } from "./SegmentEditorList";
import { createSegmentFromExtraction, type DraftSegment } from "../lib/draftSegment";
import type { BlueprintFloor } from "@/lib/dev/provisional/quotationGenerationTypes";

const ACCEPTED_EXTENSIONS = [".pdf", ".dwg", ".dxf"];

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

interface BlueprintUploadPanelProps {
  quoteId: number;
  segments: DraftSegment[];
  onChange: (next: DraftSegment[]) => void;
  onConfirm: () => void;
}

// Path B — the harder, supported path. Upload validates the file type client-side; actual
// extraction (segment detection, area computation, confidence scoring) is 100% backend
// work — see BlueprintOverlay.tsx for the coordinate-system contract this renders under.
// With no backend running, extractBlueprint() resolves from the dev-mock fixture; nothing
// about this component changes when a real endpoint replaces it.
export function BlueprintUploadPanel({ quoteId, segments, onChange, onConfirm }: BlueprintUploadPanelProps) {
  const { extractBlueprint, isExtracting, extractError, resetExtract } = useBlueprintExtraction();
  const [fileTypeError, setFileTypeError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [floors, setFloors] = useState<BlueprintFloor[] | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setFileTypeError(null);
    if (!hasAcceptedExtension(file.name)) {
      setFileTypeError(`"${file.name}" isn't a .PDF, .DWG, or .DXF file.`);
      return;
    }
    resetExtract();
    try {
      const result = await extractBlueprint(quoteId, file);
      setFloors(result.floors);
      setSelectedFloor(result.floors[0]?.floor_level ?? null);
      // Segments are seeded into the SAME wizard-level list Quick Measurement writes to —
      // "MUST VALIDATE" (edit/delete/group/add) below is just further edits to it, not a
      // separate staging area. Nothing is sent to the backend until Step 3's final save.
      onChange([
        ...segments,
        ...result.floors.flatMap((floor) => floor.segments.map((seg) => createSegmentFromExtraction(seg, floor.floor_level))),
      ]);
    } catch {
      // surfaced via extractError below — no fabricated success
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  };

  const selectFloor = (floorLevel: string) => {
    setSelectedFloor(floorLevel);
    // A fresh floor is a fresh view — no stale highlight/tooltip pointing at a segment
    // that isn't even on screen anymore. The scan + zoom reset the same way, for the same
    // reason, by remounting BlueprintOverlay (key={floorLevel} below).
    setHoveredId(null);
  };

  if (!floors) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">Upload Blueprint</h2>
          <p className="text-xs text-gray-500">
            The blueprint is segmented and measured on our end — you&apos;ll review and
            validate every detected area before continuing.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-16 transition ${
            dragging ? "border-primary bg-orange-50/30" : "border-gray-200 bg-gray-50 hover:border-primary hover:bg-orange-50/20"
          }`}
        >
          <input ref={fileRef} type="file" accept={ACCEPTED_EXTENSIONS.join(",")} className="hidden" onChange={handleInputChange} />
          {isExtracting ? (
            <>
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
              <p className="text-sm font-semibold text-gray-700">Extracting segments…</p>
            </>
          ) : (
            <>
              <UploadIcon className="h-8 w-8 text-gray-400" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">Drag &amp; drop your blueprint here</p>
                <p className="text-xs text-gray-400">or click to browse</p>
              </div>
              <div className="flex gap-1.5">
                {["PDF", "DWG", "DXF"].map((f) => (
                  <span key={f} className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-gray-500">
                    {f}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {fileTypeError && (
          <p className="flex items-center gap-1.5 text-xs text-red-500">
            <FileWarning className="h-3.5 w-3.5 shrink-0" /> {fileTypeError}
          </p>
        )}
        {extractError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Couldn&apos;t extract this blueprint: {extractError.message}
            </span>
          </div>
        )}
      </div>
    );
  }

  const currentFloor = floors.find((f) => f.floor_level === selectedFloor) ?? floors[0];
  // Includes segments added via "Add Missing Segment" while on this floor tab, not just
  // blueprint-detected ones — a floor's list is everything tagged with that floor level,
  // detected or added.
  const floorSegments = segments.filter((s) => s.floor_level === currentFloor.floor_level);
  const manualAdds = segments.filter((s) => s.source_method === "Manual");
  const confirmedCount = segments.filter((s) => s.confirmed).length;
  const allConfirmed = segments.length > 0 && confirmedCount === segments.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Review Detected Segments</h2>
          <p className="text-xs text-gray-500">
            Hover a shaded area for its size and confidence. Edit any name or area that&apos;s
            off, delete anything that isn&apos;t real, group areas that are actually one room,
            add one that was missed, and confirm each before continuing.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-2 shadow-sm">
          <span className="text-xs font-semibold text-gray-500">
            <span className={allConfirmed ? "text-green-600" : "text-gray-700"}>{confirmedCount}</span> / {segments.length} confirmed
          </span>
          {!allConfirmed && (
            <button
              type="button"
              onClick={() => onChange(segments.map((s) => ({ ...s, confirmed: true })))}
              className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600 transition hover:bg-gray-200"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Confirm All
            </button>
          )}
        </div>
      </div>

      {floors.length > 1 && (
        <div className="flex gap-1 border-b border-gray-200">
          {floors.map((f) => (
            <button
              key={f.floor_level}
              type="button"
              onClick={() => selectFloor(f.floor_level)}
              className={`relative px-4 py-2 text-sm font-semibold transition-colors ${
                f.floor_level === currentFloor.floor_level ? "text-primary" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f.floor_level}
              {f.floor_level === currentFloor.floor_level && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Remounts on floor change — a clean slate for scan/zoom/tooltip state rather than
            carrying the previous floor's animation progress or zoom level into a different
            image. */}
        <BlueprintOverlay
          key={currentFloor.floor_level}
          imageUrl={currentFloor.image_url}
          imageWidth={currentFloor.image_width}
          imageHeight={currentFloor.image_height}
          segments={floorSegments}
          hoveredId={hoveredId}
          onHoverChange={setHoveredId}
        />
        <SegmentEditorList
          segments={floorSegments}
          onChange={(nextFloorSegments) => {
            // Splice this floor's (possibly edited/grouped/deleted/added) segments back
            // into the full wizard-level list, leaving every other floor's intact. A fresh
            // "Add Missing Segment" starts with no floor_level (see createManualSegment) —
            // stamped with the CURRENT floor here, since it was added in this floor's
            // context.
            const floorDraftIds = new Set(floorSegments.map((s) => s.draft_id));
            const otherSegments = segments.filter((s) => !floorDraftIds.has(s.draft_id));
            const stamped = nextFloorSegments.map((s) => (s.floor_level ? s : { ...s, floor_level: currentFloor.floor_level }));
            onChange([...otherSegments, ...stamped]);
          }}
          showConfidence
          showConfirmToggle
          addLabel="Add Missing Segment"
          hoveredId={hoveredId}
          onHoverChange={setHoveredId}
        />
      </div>

      {manualAdds.length > 0 && (
        <p className="text-xs text-gray-400">
          {manualAdds.length} segment{manualAdds.length === 1 ? " was" : "s were"} added manually on top of the detected
          ones — this quotation is marked <span className="font-semibold text-gray-600">Hybrid</span>.
        </p>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={segments.length === 0 || !allConfirmed}
        className="w-fit rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
      >
        {allConfirmed ? `Confirm ${segments.length} Segment${segments.length === 1 ? "" : "s"}` : `Confirm all segments to continue (${confirmedCount}/${segments.length})`}
      </button>
    </div>
  );
}
