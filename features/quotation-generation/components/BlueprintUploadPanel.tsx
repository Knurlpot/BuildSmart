"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, FileWarning, Upload as UploadIcon } from "lucide-react";
import { useBlueprintExtraction, useBlueprintRescan } from "@/hooks/useQuotationGeneration";
import { BlueprintOverlay } from "./BlueprintOverlay";
import { SegmentEditorList } from "./SegmentEditorList";
import { confidenceBand, createSegmentFromExtraction, isSegmentIncluded, type DraftSegment } from "../lib/draftSegment";
import { resetBlueprintReview, rescanBlueprintReview } from "../lib/blueprintReviewActions.mjs";
import type { BlueprintFloor } from "@/lib/dev/provisional/quotationGenerationTypes";

const ACCEPTED_EXTENSIONS = [".pdf", ".dxf"];
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function boundsForPoints(points: [number, number][]): [number, number, number, number] | null {
  if (points.length === 0) return null;
  return points.reduce<[number, number, number, number]>(
    ([minX, minY, maxX, maxY], [x, y]) => [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)],
    [points[0][0], points[0][1], points[0][0], points[0][1]],
  );
}

function paddedBounds(
  bounds: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
  clampBounds?: [number, number, number, number],
): [number, number, number, number] {
  const [minX, minY, maxX, maxY] = bounds;
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08;
  const [clampMinX, clampMinY, clampMaxX, clampMaxY] = clampBounds ?? [0, 0, imageWidth, imageHeight];
  return [
    Math.max(clampMinX, minX - pad),
    Math.max(clampMinY, minY - pad),
    Math.min(clampMaxX, maxX + pad),
    Math.min(clampMaxY, maxY + pad),
  ];
}

function bestAxisSplit(values: number[], low: number, high: number): number | null {
  const unique = Array.from(new Set(values.map((value) => Math.round(value * 100) / 100))).sort((a, b) => a - b);
  if (unique.length < 8) return null;
  const span = Math.max(high - low, 1);
  const gaps = unique.slice(0, -1).map((value, index) => ({
    gap: unique[index + 1] - value,
    split: (unique[index + 1] + value) / 2,
    lowerCount: index + 1,
    upperCount: unique.length - index - 1,
  }));
  const balanced = gaps.filter(({ gap, lowerCount, upperCount }) => gap >= span * 0.06 && Math.min(lowerCount, upperCount) >= 3);
  if (balanced.length === 0) return null;
  return balanced.sort((a, b) => b.gap - a.gap)[0].split;
}

function medianAxisSplit(values: number[]): number | null {
  const sorted = values.toSorted((a, b) => a - b);
  if (sorted.length < 24) return null;
  const middle = Math.floor(sorted.length / 2);
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function splitSingleSheetFloorIntoTabs(floors: BlueprintFloor[]): BlueprintFloor[] {
  if (floors.length !== 1) return floors;
  const floor = floors[0];
  const segmentCenters = floor.segments
    .map((segment) => {
      const bounds = segment.polygon_coords ? boundsForPoints(segment.polygon_coords) : null;
      if (!bounds) return null;
      return { segment, x: (bounds[0] + bounds[2]) / 2, y: (bounds[1] + bounds[3]) / 2 };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  if (segmentCenters.length < 12) return floors;

  const xValues = segmentCenters.map((item) => item.x);
  const yValues = segmentCenters.map((item) => item.y);
  const xSplit = bestAxisSplit(xValues, 0, floor.image_width) ?? (segmentCenters.length >= 80 ? medianAxisSplit(xValues) : null);
  const ySplit = bestAxisSplit(yValues, 0, floor.image_height) ?? (segmentCenters.length >= 80 ? medianAxisSplit(yValues) : null);
  if (xSplit === null || ySplit === null) return floors;

  const groups = [
    {
      name: "Floor Plan 1",
      bounds: [0, 0, xSplit, ySplit] as [number, number, number, number],
      items: segmentCenters.filter((item) => item.x <= xSplit && item.y <= ySplit),
    },
    {
      name: "Floor Plan 2",
      bounds: [xSplit, 0, floor.image_width, ySplit] as [number, number, number, number],
      items: segmentCenters.filter((item) => item.x > xSplit && item.y <= ySplit),
    },
    {
      name: "Floor Plan 3",
      bounds: [xSplit, ySplit, floor.image_width, floor.image_height] as [number, number, number, number],
      items: segmentCenters.filter((item) => item.x > xSplit && item.y > ySplit),
    },
    {
      name: "Ground Floor Plan",
      bounds: [0, ySplit, xSplit, floor.image_height] as [number, number, number, number],
      items: segmentCenters.filter((item) => item.x <= xSplit && item.y > ySplit),
    },
  ].filter((group) => group.items.length >= Math.max(3, Math.floor(segmentCenters.length * 0.08)));

  if (groups.length < 2) return floors;

  return groups.map((group, index) => {
    const points = group.items.flatMap((item) => item.segment.polygon_coords ?? []);
    const focusBounds = boundsForPoints(points);
    const floorLevel = group.name;
    return {
      ...floor,
      floor_id: index + 1,
      floor_level: floorLevel,
      floor_name: floorLevel,
      focus_bounds: focusBounds ? paddedBounds(focusBounds, floor.image_width, floor.image_height, group.bounds) : floor.focus_bounds,
      viewport_bbox: focusBounds ?? floor.viewport_bbox,
      segments: group.items.map((item, segmentIndex) => ({
        ...item.segment,
        segment_id: `segment_f${index + 1}_${String(segmentIndex + 1).padStart(2, "0")}`,
      })),
    };
  });
}

function confidenceSummary(segments: DraftSegment[]) {
  return segments.reduce(
    (summary, segment) => {
      const band = confidenceBand(segment.confidence_score);
      summary[band] += 1;
      return summary;
    },
    { high: 0, medium: 0, low: 0, none: 0 },
  );
}

interface BlueprintUploadPanelProps {
  quoteId: number;
  /** Part G — the review header shows just this, not the client name/preamble too. */
  projectName: string;
  segments: DraftSegment[];
  onChange: (next: DraftSegment[]) => void;
  onConfirm: () => void;
  /** Part H — returns to the input-method choice overlay. */
  onBack: () => void;
  // P2 Part E — floors/originalFloors are lifted to the wizard (QuotationGenerationWizard)
  // rather than owned here. A Structural revision returns to this same step by changing the
  // wizard's `step` state, which unmounts/remounts THIS component — if the scan lived in
  // local useState it would reset to null on remount and force a brand new upload, exactly
  // the bug this task calls out. Controlled here, it survives the remount untouched. `null`
  // means "nothing scanned yet" (show the upload dropzone).
  floors: BlueprintFloor[] | null;
  onFloorsChange: (floors: BlueprintFloor[] | null) => void;
  originalFloors: BlueprintFloor[] | null;
  onOriginalFloorsChange: (floors: BlueprintFloor[] | null) => void;
  blueprintFilePath: string | null;
  onBlueprintFilePathChange: (path: string | null) => void;
}

// Path B — the harder, supported path. Upload validates the file type client-side; actual
// extraction (segment detection, area computation, confidence scoring) is 100% backend
// work — see BlueprintOverlay.tsx for the coordinate-system contract this renders under.
// With no backend running, extractBlueprint() resolves from the dev-mock fixture; nothing
// about this component changes when a real endpoint replaces it.
export function BlueprintUploadPanel({
  quoteId,
  projectName,
  segments,
  onChange,
  onConfirm,
  onBack,
  floors,
  onFloorsChange,
  originalFloors,
  onOriginalFloorsChange,
  blueprintFilePath,
  onBlueprintFilePathChange,
}: BlueprintUploadPanelProps) {
  const { extractBlueprint, isExtracting, extractError, resetExtract } = useBlueprintExtraction();
  const { rescanBlueprint, isRescanning, rescanError, resetRescan } = useBlueprintRescan();
  const [fileTypeError, setFileTypeError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Part C — a file is only STAGED here first; scanning is a separate, explicit action.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(floors?.[0]?.floor_level ?? null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [overlayScanning, setOverlayScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = (file: File) => {
    setFileTypeError(null);
    if (!hasAcceptedExtension(file.name)) {
      setFileTypeError(`"${file.name}" isn't a .PDF or .DXF file.`);
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      setFileTypeError(`"${file.name}" must be between 1 byte and 25 MB.`);
      return;
    }
    resetExtract();
    resetRescan();
    onBlueprintFilePathChange(null);
    onFloorsChange(null);
    onOriginalFloorsChange(null);
    onChange(segments.filter((segment) => segment.source_method !== "Blueprint"));
    setSelectedFloor(null);
    setHoveredId(null);
    setOverlayScanning(false);
    setSelectedFile(file);
  };

  const handleScan = async () => {
    if (!selectedFile) return;
    const nonBlueprintSegments = segments.filter((segment) => segment.source_method !== "Blueprint");
    try {
      onFloorsChange(null);
      onOriginalFloorsChange(null);
      onChange(nonBlueprintSegments);
      setOverlayScanning(false);
      const result = await extractBlueprint(quoteId, selectedFile);
      const splitFloors = splitSingleSheetFloorIntoTabs(result.floors);
      onFloorsChange(splitFloors);
      onOriginalFloorsChange(splitFloors);
      onBlueprintFilePathChange(result.blueprint_file_path ?? null);
      setSelectedFloor(splitFloors[0]?.floor_level ?? null);
      // Segments are seeded into the SAME wizard-level list Quick Measurement writes to —
      // "MUST VALIDATE" (edit/delete/group/add) below is just further edits to it, not a
      // separate staging area. Nothing is sent to the backend until Step 3's final save.
      onChange([
        ...nonBlueprintSegments,
        ...splitFloors.flatMap((floor) => floor.segments.map((seg) => createSegmentFromExtraction(seg, floor.floor_level))),
      ]);
    } catch {
      // surfaced via extractError below — no fabricated success
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFileSelected(file);
  };

  const selectFloor = (floorLevel: string) => {
    setSelectedFloor(floorLevel);
    // A fresh floor is a fresh view — no stale highlight/tooltip pointing at a segment
    // that isn't even on screen anymore. The scan + zoom reset the same way, for the same
    // reason, by remounting BlueprintOverlay (key={floorLevel} below).
    setHoveredId(null);
  };

  // Part E — the actual restart: every edit/grouping/deletion/manual-add since the first
  // scan is discarded, replaced with a fresh reconstruction of the original detection.
  const handleRescanConfirmed = async () => {
    if (selectedFile) {
      const nonBlueprintSegments = segments.filter((segment) => segment.source_method !== "Blueprint");
      try {
        setOverlayScanning(false);
        const result = await extractBlueprint(quoteId, selectedFile);
        const splitFloors = splitSingleSheetFloorIntoTabs(result.floors);
        onFloorsChange(splitFloors);
        onOriginalFloorsChange(splitFloors);
        setSelectedFloor(splitFloors[0]?.floor_level ?? null);
        onChange([
          ...nonBlueprintSegments,
          ...splitFloors.flatMap((floor) => floor.segments.map((seg) => createSegmentFromExtraction(seg, floor.floor_level))),
        ]);
        setHoveredId(null);
        return;
      } catch {
        // surfaced via extractError below; fall back to the saved extraction if present
      }
    }
    if (!originalFloors) return;
    const reset = resetBlueprintReview(originalFloors, (nextFloors: BlueprintFloor[]) =>
      nextFloors.flatMap((floor) => floor.segments.map((seg) => createSegmentFromExtraction(seg, floor.floor_level))),
    );
    onChange(reset.segments);
    onFloorsChange(reset.floors);
    setSelectedFloor(originalFloors[0]?.floor_level ?? null);
    setHoveredId(null);
  };

  const handleGenuineRescan = async () => {
    if (!blueprintFilePath) return;
    try {
      const rescanned = await rescanBlueprintReview(
        () => rescanBlueprint(quoteId),
        (nextFloors: BlueprintFloor[]) => nextFloors.flatMap((floor) => floor.segments.map((seg) => createSegmentFromExtraction(seg, floor.floor_level))),
      );
      const result = rescanned.result;
      onFloorsChange(rescanned.floors);
      onOriginalFloorsChange(rescanned.floors);
      onBlueprintFilePathChange(result.blueprint_file_path ?? blueprintFilePath);
      setSelectedFloor(result.floors[0]?.floor_level ?? null);
      setHoveredId(null);
      onChange(rescanned.segments);
    } catch {
      // Surfaced below.
    }
  };

  const handleBackToUpload = () => {
    resetExtract();
    resetRescan();
    setSelectedFile(null);
    setSelectedFloor(null);
    setHoveredId(null);
    onBlueprintFilePathChange(null);
    onFloorsChange(null);
    onOriginalFloorsChange(null);
    onChange(segments.filter((segment) => segment.source_method !== "Blueprint"));
  };

  if (!floors) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            title="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-base font-bold text-gray-900">Upload Blueprint</h2>
            <p className="text-xs text-gray-500">
              The blueprint is segmented and measured automatically. You&apos;ll review and
              validate every detected area before continuing.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
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
                if (file) handleFileSelected(file);
              }}
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-16 transition ${
                dragging ? "border-primary bg-orange-50/30" : "border-gray-200 bg-gray-50 hover:border-primary hover:bg-orange-50/20"
              }`}
            >
              <input ref={fileRef} type="file" accept={ACCEPTED_EXTENSIONS.join(",")} className="hidden" onChange={handleInputChange} />
              <UploadIcon className="h-8 w-8 text-gray-400" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">Drag &amp; drop your blueprint here</p>
                <p className="text-xs text-gray-400">or click to browse (max 25 MB)</p>
              </div>
              <div className="flex gap-1.5">
                {["PDF", "DXF"].map((f) => (
                  <span key={f} className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-gray-500">
                    {f}
                  </span>
                ))}
              </div>
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

          {/* Part C — the right-side space shows the staged file instead of sitting empty;
              scanning only starts once the user confirms it's the right document. */}
          <div className="w-full lg:w-72 lg:shrink-0">
            {selectedFile ? (
              <div className="rounded-2xl border-2 border-gray-200 bg-white p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Detected File</p>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleScan}
                  disabled={isExtracting}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-(--primary-hover) disabled:opacity-60"
                >
                  {isExtracting ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Scanning…
                    </>
                  ) : (
                    "Scan Document"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  disabled={isExtracting}
                  className="mt-2 w-full text-center text-xs font-semibold text-gray-400 transition hover:text-gray-600 disabled:opacity-50"
                >
                  Choose a different file
                </button>
              </div>
            ) : (
              <div className="flex h-full min-h-40 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center">
                <FileText className="h-6 w-6 text-gray-300" />
                <p className="text-xs text-gray-400">Your file previews here before it&apos;s scanned.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const reviewFloors = splitSingleSheetFloorIntoTabs(floors);
  const currentFloor = reviewFloors.find((f) => f.floor_level === selectedFloor) ?? reviewFloors[0];
  // Includes segments added via "Add Missing Segment" while on this floor tab, not just
  // blueprint-detected ones — a floor's list is everything tagged with that floor level,
  // detected or added.
  const directlyTaggedFloorSegments = segments.filter((s) => s.floor_level === currentFloor.floor_level);
  const filterBounds = currentFloor.viewport_bbox ?? currentFloor.focus_bounds;
  const floorSegments =
    directlyTaggedFloorSegments.length > 0 || !filterBounds
      ? directlyTaggedFloorSegments
      : segments.filter((segment) => {
          const bounds = segment.polygon_coords ? boundsForPoints(segment.polygon_coords) : null;
          if (!bounds) return false;
          const [minX, minY, maxX, maxY] = filterBounds;
          const centerX = (bounds[0] + bounds[2]) / 2;
          const centerY = (bounds[1] + bounds[3]) / 2;
          return centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY;
        });
  const floorIncludedSegments = floorSegments.filter(isSegmentIncluded);
  const floorConfidence = confidenceSummary(floorIncludedSegments);
  const floorNeedsCloserReview = floorConfidence.medium + floorConfidence.low + floorConfidence.none;
  const floorConfirmedIncludedCount = floorIncludedSegments.filter((s) => s.confirmed).length;
  const manualAdds = segments.filter((s) => s.source_method === "Manual");
  // Part F — only segments still in scope for this quote need to be confirmed. Excluding a
  // segment (still visible in the list, never deleted) removes it from this gate.
  const includedSegments = segments.filter(isSegmentIncluded);
  const confirmedIncludedCount = includedSegments.filter((s) => s.confirmed).length;
  const allIncludedConfirmed = includedSegments.length > 0 && confirmedIncludedCount === includedSegments.length;
  const confirmationDisabled = overlayScanning || isRescanning;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={handleBackToUpload}
          title="Back to Upload"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          {/* Part G — trimmed to the project name only, no redundant client-name preamble. */}
          <h2 className="text-base font-bold text-gray-900">{projectName}</h2>
          <p className="text-xs text-gray-500">
            Review each detected room. Correct names and areas, remove false results, add missing rooms, then confirm.
          </p>
        </div>
      </div>

      {reviewFloors.length > 1 && (
        // Part D — pill/segmented floor tabs (copies Replit's active = solid-fill style,
        // instead of the earlier underline treatment).
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
          {reviewFloors.map((f) => (
            <button
              key={f.floor_level}
              type="button"
              onClick={() => selectFloor(f.floor_level)}
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

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">{currentFloor.floor_level}</span>
        <span>
          {floorConfirmedIncludedCount}/{floorIncludedSegments.length} included confirmed on this floor · {floorSegments.length} total segment{floorSegments.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs text-gray-600 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {floorNeedsCloserReview > 0 ? (
            <>
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="font-semibold text-gray-800">{floorNeedsCloserReview} segment{floorNeedsCloserReview === 1 ? "" : "s"} need closer review</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
              <span className="font-semibold text-gray-800">All included segments are high confidence</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-green-100 px-2 py-0.5 font-bold text-green-700">High {floorConfidence.high}</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">Medium {floorConfidence.medium}</span>
          <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">Low {floorConfidence.low}</span>
          {floorConfidence.none > 0 && <span className="rounded-full bg-gray-100 px-2 py-0.5 font-bold text-gray-600">Unknown {floorConfidence.none}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Remounts on floor change — a clean slate for scan/zoom/tooltip state rather than
            carrying the previous floor's animation progress or zoom level into a different
            image. */}
        <BlueprintOverlay
          key={currentFloor.floor_level}
          imageUrl={currentFloor.image_url}
          imageWidth={currentFloor.image_width}
          imageHeight={currentFloor.image_height}
          focusBounds={currentFloor.focus_bounds}
          segments={floorSegments}
          hoveredId={hoveredId}
          onHoverChange={setHoveredId}
          onResetConfirmed={handleRescanConfirmed}
          onRescanConfirmed={handleGenuineRescan}
          canRescan={Boolean(blueprintFilePath)}
          isRescanning={isRescanning}
          onScanStateChange={(scanning) => setOverlayScanning(scanning || isRescanning)}
        />
        <SegmentEditorList
          segments={floorSegments}
          onChange={(nextFloorSegments) => {
            // Splice this floor's (possibly edited/grouped/deleted/added) segments back
            // into the full wizard-level list, leaving every other floor's intact. A fresh
            // "Add Missing Segment" starts with no floor_level (see createManualSegment) —
            // stamped with the CURRENT floor here, since it was added in this floor's
            // context.
            const currentFloorDraftIds = new Set(floorSegments.map((s) => s.draft_id));
            const currentFloorLevels = new Set(floorSegments.map((s) => s.floor_level).filter(Boolean));
            const otherSegments = segments.filter((s) => {
              if (currentFloorDraftIds.has(s.draft_id)) return false;
              return !s.floor_level || !currentFloorLevels.has(s.floor_level);
            });
            const stamped = nextFloorSegments.map((s) => (s.floor_level ? s : { ...s, floor_level: currentFloor.floor_level }));
            onChange([...otherSegments, ...stamped]);
          }}
          showConfidence
          showConfirmToggle
          showIncludeToggle
          addLabel="Add Missing Segment"
          hoveredId={hoveredId}
          onHoverChange={setHoveredId}
          // Part D — quote-wide counts (every floor), not just this floor's `floorSegments`
          // — see SegmentEditorList.tsx's confirmSummary doc for why this can't be derived
          // inside that component.
          confirmSummary={{
            confirmedCount: confirmedIncludedCount,
            includedCount: includedSegments.length,
            onConfirmAll: () => onChange(segments.map((s) => (isSegmentIncluded(s) ? { ...s, confirmed: true } : s))),
            disabled: confirmationDisabled,
          }}
        />
      </div>

      {!blueprintFilePath && (
        <p className="text-xs text-amber-700">Saved-file storage is not configured. Reset is available, but genuine rescan is disabled.</p>
      )}
      {rescanError && (
        <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> Rescan failed: {rescanError.message}</p>
      )}

      {manualAdds.length > 0 && (
        <p className="text-xs text-gray-400">
          {manualAdds.length} segment{manualAdds.length === 1 ? " was" : "s were"} added manually on top of the detected
          ones. This quotation is marked <span className="font-semibold text-gray-600">Hybrid</span>.
        </p>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmationDisabled || includedSegments.length === 0 || !allIncludedConfirmed}
        className="w-fit rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
      >
        {confirmationDisabled
          ? "Scanning blueprint..."
          : includedSegments.length === 0
          ? "Include at least one segment to continue"
          : allIncludedConfirmed
            ? `Confirm ${includedSegments.length} selected segment${includedSegments.length === 1 ? "" : "s"} to continue`
            : `Confirm all included segments to continue (${confirmedIncludedCount}/${includedSegments.length})`}
      </button>
    </div>
  );
}
