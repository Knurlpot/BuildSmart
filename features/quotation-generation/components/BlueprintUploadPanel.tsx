"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, FileText, FileWarning, Upload as UploadIcon } from "lucide-react";
import { useBlueprintExtraction } from "@/hooks/useQuotationGeneration";
import { BlueprintOverlay } from "./BlueprintOverlay";
import { SegmentEditorList } from "./SegmentEditorList";
import { createSegmentFromExtraction, isSegmentIncluded, type DraftSegment } from "../lib/draftSegment";
import type { BlueprintFloor } from "@/lib/dev/provisional/quotationGenerationTypes";

const ACCEPTED_EXTENSIONS = [".pdf", ".dwg", ".dxf"];

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
}: BlueprintUploadPanelProps) {
  const { extractBlueprint, isExtracting, extractError, resetExtract } = useBlueprintExtraction();
  const [fileTypeError, setFileTypeError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Part C — a file is only STAGED here first; scanning is a separate, explicit action.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(floors?.[0]?.floor_level ?? null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = (file: File) => {
    setFileTypeError(null);
    if (!hasAcceptedExtension(file.name)) {
      setFileTypeError(`"${file.name}" isn't a .PDF, .DWG, or .DXF file.`);
      return;
    }
    resetExtract();
    setSelectedFile(file);
  };

  const handleScan = async () => {
    if (!selectedFile) return;
    try {
      const result = await extractBlueprint(quoteId, selectedFile);
      onFloorsChange(result.floors);
      onOriginalFloorsChange(result.floors);
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
  const handleRescanConfirmed = () => {
    if (!originalFloors) return;
    const fresh = originalFloors.flatMap((floor) => floor.segments.map((seg) => createSegmentFromExtraction(seg, floor.floor_level)));
    onChange(fresh);
    onFloorsChange(originalFloors);
    setSelectedFloor(originalFloors[0]?.floor_level ?? null);
    setHoveredId(null);
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
              The blueprint is segmented and measured on our end — you&apos;ll review and
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
                <p className="text-xs text-gray-400">or click to browse</p>
              </div>
              <div className="flex gap-1.5">
                {["PDF", "DWG", "DXF"].map((f) => (
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

  const currentFloor = floors.find((f) => f.floor_level === selectedFloor) ?? floors[0];
  // Includes segments added via "Add Missing Segment" while on this floor tab, not just
  // blueprint-detected ones — a floor's list is everything tagged with that floor level,
  // detected or added.
  const floorSegments = segments.filter((s) => s.floor_level === currentFloor.floor_level);
  const manualAdds = segments.filter((s) => s.source_method === "Manual");
  // Part F — only segments still in scope for this quote need to be confirmed. Excluding a
  // segment (still visible in the list, never deleted) removes it from this gate.
  const includedSegments = segments.filter(isSegmentIncluded);
  const confirmedIncludedCount = includedSegments.filter((s) => s.confirmed).length;
  const allIncludedConfirmed = includedSegments.length > 0 && confirmedIncludedCount === includedSegments.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          title="Back to Upload"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          {/* Part G — trimmed to the project name only, no redundant client-name preamble. */}
          <h2 className="text-base font-bold text-gray-900">{projectName}</h2>
          <p className="text-xs text-gray-500">
            Hover a shaded area for its size and confidence. Edit any name or area that&apos;s
            off, delete anything that isn&apos;t real, group areas that are actually one room,
            add one that was missed, and confirm each before continuing.
          </p>
        </div>
      </div>

      {floors.length > 1 && (
        // Part D — pill/segmented floor tabs (copies Replit's active = solid-fill style,
        // instead of the earlier underline treatment).
        <div className="flex w-fit gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {floors.map((f) => (
            <button
              key={f.floor_level}
              type="button"
              onClick={() => selectFloor(f.floor_level)}
              className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${
                f.floor_level === currentFloor.floor_level ? "bg-primary text-primary-foreground" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {f.floor_level}
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
          onRescanConfirmed={handleRescanConfirmed}
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
          }}
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
        disabled={includedSegments.length === 0 || !allIncludedConfirmed}
        className="w-fit rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
      >
        {includedSegments.length === 0
          ? "Include at least one segment to continue"
          : allIncludedConfirmed
            ? `Confirm ${includedSegments.length} selected segment${includedSegments.length === 1 ? "" : "s"} to continue`
            : `Confirm all included segments to continue (${confirmedIncludedCount}/${includedSegments.length})`}
      </button>
    </div>
  );
}
