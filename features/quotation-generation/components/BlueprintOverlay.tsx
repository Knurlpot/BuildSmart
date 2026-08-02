"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ZoomIn, ZoomOut, RotateCcw, ScanLine } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CONFIDENCE_BAND_LABEL, confidenceBand, polygonCentroidY, type DraftSegment } from "../lib/draftSegment";

const BAND_COLOR: Record<ReturnType<typeof confidenceBand>, string> = {
  high: "#16a34a", // green — confidence >= 90
  medium: "#d97706", // amber — 70-89
  low: "#dc2626", // red — < 70
  none: "#6b7280",
};

const SCAN_DURATION_MS = 4000;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;
const TOOLTIP_WIDTH = 210;
const TOOLTIP_HEIGHT = 96;

interface BlueprintOverlayProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  /** Already filtered to this floor's segments that still have a polygon (a merged/grouped
   * segment has none — see draftSegment.ts's mergeSegments). */
  segments: DraftSegment[];
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
  /** Part E — the actual DATA reset (discarding edits/groupings/deletions/manual adds back
   * to the original extraction) lives in the parent (BlueprintUploadPanel), which is the
   * one holding the original extraction result. This component only owns the confirm
   * dialog + the visual scan-replay; once the user confirms, it calls this AND replays its
   * own local scan animation. Omitted when `readOnly` — see that prop's doc. */
  onRescanConfirmed?: () => void;
  /** Task 7, Part B — Segment Breakdown reuses this exact component (not a rebuild) to
   * preview an already-generated/saved quote's blueprint. Rescan is a destructive EDIT
   * action that only makes sense during Review Segments (step 3) — hidden here, along with
   * the first-mount scan animation (polygons render fully revealed immediately; there's
   * nothing being "discovered" in a view that's just replaying already-reviewed data).
   * Zoom and hover stay — pure viewing affordances, not edits. Defaults false so every
   * existing caller (BlueprintUploadPanel) is unaffected. */
  readOnly?: boolean;
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
// rendering out. Part D copies Replit's dark-canvas LOOK — it does NOT switch to Replit's
// percentage-box coordinate model.
//
// ⚠️ The "scan" animation below (progress bar + sweeping line + progressive polygon
// reveal) is PURE PRESENTATION over that same data — a visual affordance so the review
// step doesn't feel like a hard data dump, not a claim that anything is being detected
// client-side. Every polygon it reveals was already in `segments` the instant this
// component mounted; the scan only staggers when each one fades in.
export function BlueprintOverlay({ imageUrl, imageWidth, imageHeight, segments, hoveredId, onHoverChange, onRescanConfirmed, readOnly = false }: BlueprintOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Scan animation — RAF-driven, not setInterval, per the task's explicit ask. ──
  // readOnly starts fully "scanned" (scanning=false) so a Segment Breakdown viewer sees
  // every polygon immediately, not a ~4s replay of a scan that already happened in step 3.
  const [rescanToken, setRescanToken] = useState(0);
  const [syncedRescanToken, setSyncedRescanToken] = useState(0);
  const [scanProgress, setScanProgress] = useState(readOnly ? 100 : 0);
  const [scanning, setScanning] = useState(!readOnly);
  const [rescanConfirmOpen, setRescanConfirmOpen] = useState(false);

  // Adjusted during render (React's documented pattern for this — see e.g.
  // app/(app)/account/page.tsx's deactivate-dialog countdown) rather than a setState call
  // inside the effect body below: resets the animation whenever "Rescan" is confirmed.
  // Unreachable when readOnly (rescanToken never changes — there's no Rescan button).
  if (rescanToken !== syncedRescanToken) {
    setSyncedRescanToken(rescanToken);
    setScanProgress(0);
    setScanning(true);
  }

  useEffect(() => {
    if (readOnly) return;
    let start: number | null = null;
    let raf: number;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const pct = Math.min(100, ((ts - start) / SCAN_DURATION_MS) * 100);
      setScanProgress(pct);
      if (pct < 100) {
        raf = requestAnimationFrame(step);
      } else {
        setScanning(false);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [rescanToken, readOnly]);

  const handleRescanConfirm = () => {
    setRescanConfirmOpen(false);
    onRescanConfirmed?.();
    setRescanToken((t) => t + 1);
  };

  // ── Zoom ──
  const [zoom, setZoom] = useState(1);
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
  const zoomReset = () => setZoom(1);

  // ── Cursor-following tooltip ──
  // Container width/height travel alongside the cursor position, captured together from
  // the same getBoundingClientRect() call inside the event handler — this project's lint
  // config forbids reading ref.current during render (react-hooks/refs), so the container
  // size can't be read back out of containerRef at render time the way it's read here.
  const [cursor, setCursor] = useState<{ x: number; y: number; containerWidth: number; containerHeight: number } | null>(null);
  const hoveredSegment = segments.find((s) => s.draft_id === hoveredId) ?? null;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, containerWidth: rect.width, containerHeight: rect.height });
  };

  const tooltipLeft = cursor && cursor.x + TOOLTIP_WIDTH + 20 > cursor.containerWidth ? cursor.x - TOOLTIP_WIDTH - 14 : (cursor?.x ?? 0) + 14;
  const tooltipTop = cursor && cursor.y + TOOLTIP_HEIGHT + 20 > cursor.containerHeight ? cursor.y - TOOLTIP_HEIGHT - 14 : (cursor?.y ?? 0) + 14;

  const scanLineY = (scanProgress / 100) * imageHeight;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-gray-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
            <span className="h-2 w-2 rounded-full" style={{ background: BAND_COLOR.high }} /> High &ge;90%
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
            <span className="h-2 w-2 rounded-full" style={{ background: BAND_COLOR.medium }} /> Medium 70-89%
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
            <span className="h-2 w-2 rounded-full" style={{ background: BAND_COLOR.low }} /> Low &lt;70%
          </span>
        </div>
        <div className="flex flex-wrap shrink-0 items-center gap-1">
          {/* Part E — no longer a silent reset: this only OPENS the confirm dialog below.
              Hidden entirely when readOnly — Rescan is an edit action with no meaning
              outside Review Segments (Task 7, Part B). */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setRescanConfirmOpen(true)}
              title="Rescan"
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-500 transition hover:border-primary hover:text-primary"
            >
              <ScanLine className="h-3.5 w-3.5" /> Rescan
            </button>
          )}
          <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 bg-white">
            <button type="button" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} title="Zoom out" className="p-1.5 text-gray-500 transition hover:bg-gray-50 disabled:opacity-30">
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={zoomReset}
              title="Reset zoom"
              className="w-12 border-x border-gray-200 py-1.5 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom in" className="p-1.5 text-gray-500 transition hover:bg-gray-50 disabled:opacity-30">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
          {zoom !== 1 && (
            <button type="button" onClick={zoomReset} title="Reset" className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 transition hover:text-gray-600">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Part D — dark-blue canvas (copies Replit's look; the polygon/viewBox rendering
          underneath is unchanged, see the file header contract). */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        className="relative overflow-auto rounded-xl border border-slate-800 bg-slate-900"
        style={{ maxHeight: 560 }}
      >
        <svg
          viewBox={`0 0 ${imageWidth} ${imageHeight}`}
          className="block h-auto"
          style={{ width: `${zoom * 100}%`, minWidth: "100%" }}
        >
          <image href={imageUrl} x={0} y={0} width={imageWidth} height={imageHeight} />
          {segments.map((seg) => {
            if (!seg.polygon_coords) return null;
            const color = BAND_COLOR[confidenceBand(seg.confidence_score)];
            const isHovered = hoveredId === seg.draft_id;
            const revealed = !scanning || scanLineY >= polygonCentroidY(seg.polygon_coords);
            return (
              <polygon
                key={seg.draft_id}
                points={seg.polygon_coords.map(([x, y]) => `${x},${y}`).join(" ")}
                fill={color}
                fillOpacity={revealed ? (isHovered ? 0.4 : 0.2) : 0}
                stroke={color}
                strokeOpacity={revealed ? 1 : 0}
                strokeWidth={isHovered ? 6 : 3}
                className={`transition-[fill-opacity,stroke-opacity,stroke-width] duration-500 ${revealed ? "cursor-pointer" : "pointer-events-none"}`}
                onMouseEnter={() => onHoverChange(seg.draft_id)}
                onMouseLeave={() => onHoverChange(null)}
              />
            );
          })}
          {scanning && (
            <g>
              <defs>
                <linearGradient id="scan-glow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb923c" stopOpacity="0" />
                  <stop offset="50%" stopColor="#fb923c" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect x={0} y={Math.max(0, scanLineY - 40)} width={imageWidth} height={80} fill="url(#scan-glow)" />
              <line x1={0} y1={scanLineY} x2={imageWidth} y2={scanLineY} stroke="#f97316" strokeWidth={3} />
            </g>
          )}
        </svg>

        {scanning && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-black/70 px-4 py-2 backdrop-blur-sm">
            <ScanLine className="h-4 w-4 shrink-0 animate-pulse text-primary" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${scanProgress}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right text-xs font-bold text-white/90">Scanning… {Math.round(scanProgress)}%</span>
          </div>
        )}

        {hoveredSegment && cursor && (
          <div
            className="pointer-events-none absolute z-10 flex w-52 flex-col gap-1 rounded-lg border border-white/10 bg-slate-800 p-3 text-xs shadow-2xl"
            style={{ left: tooltipLeft, top: tooltipTop }}
          >
            <p className="truncate font-bold text-white">{hoveredSegment.segment_name || "Untitled segment"}</p>
            <p className="text-white/60">{hoveredSegment.area_sqm.toFixed(1)} sqm</p>
            {hoveredSegment.confidence_score !== null && (
              <p className="flex items-center gap-1.5 text-white/80">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: BAND_COLOR[confidenceBand(hoveredSegment.confidence_score)] }} />
                {hoveredSegment.confidence_score}% confidence · {CONFIDENCE_BAND_LABEL[confidenceBand(hoveredSegment.confidence_score)]}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Part E — rescanning RESTARTS: warn before discarding edits, don't silently wipe
          the user's work. Unreachable when readOnly (no button opens it), so skip
          rendering it at all rather than mount a dialog that can never show. */}
      {!readOnly && (
      <Dialog open={rescanConfirmOpen} onOpenChange={setRescanConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" /> Rescan this blueprint?
            </DialogTitle>
            <DialogDescription>
              This restarts the review. Every edit you&apos;ve made — renamed or resized
              segments, groupings, deletions, and anything added manually — is discarded,
              and the view returns to the system&apos;s original detected findings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRescanConfirmOpen(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Keep My Changes
            </button>
            <button
              type="button"
              onClick={handleRescanConfirm}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
            >
              Rescan and Discard Edits
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}