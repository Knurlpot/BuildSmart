"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Minus, Move, PenLine, Plus, ZoomIn, ZoomOut, RotateCcw, ScanLine } from "lucide-react";
import { confidenceBand, type DraftSegment, type SegmentPolygon } from "../lib/draftSegment";

const BAND_COLOR: Record<ReturnType<typeof confidenceBand>, string> = {
  high: "#16a34a", // green, 85+
  medium: "#d97706", // amber, 60-84
  low: "#dc2626", // red, below 60
  none: "#6b7280",
};

const SCAN_DURATION_MS = 4000;
const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;
const DEFAULT_ZOOM = 1;
const DEFAULT_CROP_SCALE = 1.18;
const FLOOR_CROP_PADDING_RATIO = 0.04;
const TOOLTIP_WIDTH = 210;
const TOOLTIP_HEIGHT = 96;

const pointsToSvg = (points: [number, number][]) => points.map(([x, y]) => `${x},${y}`).join(" ");

const polygonCenterY = (points: [number, number][]) => {
  if (points.length === 0) return 0;
  return points.reduce((sum, [, y]) => sum + y, 0) / points.length;
};

const distanceToSegment = (point: [number, number], start: [number, number], end: [number, number]) => {
  const [px, py] = point;
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - sx, py - sy);
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared));
  return Math.hypot(px - (sx + t * dx), py - (sy + t * dy));
};

const insertPointOnNearestEdge = (points: [number, number][], point: [number, number]) => {
  if (points.length < 2) return [...points, point];
  let insertIndex = points.length;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const distance = distanceToSegment(point, points[index], points[nextIndex]);
    if (distance < bestDistance) {
      bestDistance = distance;
      insertIndex = nextIndex;
    }
  }
  return [...points.slice(0, insertIndex), point, ...points.slice(insertIndex)];
};

type HighlightEditTool = "move" | "move-shape" | "add" | "remove";

const segmentPolygons = (segment: DraftSegment): SegmentPolygon[] => {
  if (segment.polygon_groups?.length) return segment.polygon_groups;
  return segment.polygon_coords ? [segment.polygon_coords] : [];
};

interface BlueprintOverlayProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  focusBounds?: [number, number, number, number] | null;
  /** Already filtered to this floor's segments that still have a polygon (a merged/grouped
   * segment has none — see draftSegment.ts's mergeSegments). */
  segments: DraftSegment[];
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
  groupingSelectedIds?: ReadonlySet<string>;
  onSegmentPolygonChange?: (draftId: string, polygonCoords: SegmentPolygon, polygonIndex?: number) => void;
  onScan?: () => void;
  canRescan?: boolean;
  isRescanning?: boolean;
  onScanStateChange?: (scanning: boolean) => void;
  scanOnMount?: boolean;
  disableHighlightEditing?: boolean;
  topLeftOverlay?: ReactNode;
  /** Task 7, Part B — Segment Breakdown reuses this exact component (not a rebuild) to
   * preview an already-generated/saved quote's blueprint. Rescan is a destructive EDIT
   * action that only makes sense during Review Segments (step 3) — hidden here, along with
   * the first-mount scan animation (polygons render fully revealed immediately; there's
   * nothing being "discovered" in a view that's just replaying already-reviewed data).
   * Hover stays so the preview and segment deck still cross-highlight. Defaults false so every
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
export function BlueprintOverlay({
  imageUrl,
  imageWidth,
  imageHeight,
  focusBounds,
  segments,
  hoveredId,
  onHoverChange,
  groupingSelectedIds,
  onSegmentPolygonChange,
  onScan,
  canRescan = false,
  isRescanning = false,
  onScanStateChange,
  scanOnMount = false,
  disableHighlightEditing = false,
  topLeftOverlay,
  readOnly = false,
}: BlueprintOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [editingHighlights, setEditingHighlights] = useState(false);
  const [draggingPoint, setDraggingPoint] = useState<{ draftId: string; polygonIndex: number; pointIndex: number } | null>(null);
  const [draggingShape, setDraggingShape] = useState<{ draftId: string; polygonIndex: number; lastPoint: [number, number] } | null>(null);
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const [selectedEditPolygonIndex, setSelectedEditPolygonIndex] = useState(0);
  const [highlightEditTool, setHighlightEditTool] = useState<HighlightEditTool>("move");

  // ── Scan animation — RAF-driven, not setInterval, per the task's explicit ask. ──
  // readOnly starts fully "scanned" (scanning=false) so a Segment Breakdown viewer sees
  // every polygon immediately, not a ~4s replay of a scan that already happened in step 3.
  const [rescanToken, setRescanToken] = useState(0);
  const [syncedRescanToken, setSyncedRescanToken] = useState(0);
  const shouldScanOnMount = scanOnMount && !readOnly;
  const [scanProgress, setScanProgress] = useState(shouldScanOnMount ? 0 : 100);
  const [scanning, setScanning] = useState(shouldScanOnMount);

  useEffect(() => {
    onScanStateChange?.(scanning);
  }, [onScanStateChange, scanning]);

  // Adjusted during render (React's documented pattern for this — see e.g.
  // app/(app)/account/page.tsx's deactivate-dialog countdown) rather than a setState call
  // inside the effect body below: resets the animation whenever "Rescan" is clicked.
  // Unreachable when readOnly (rescanToken never changes — there's no Rescan button).
  if (rescanToken !== syncedRescanToken) {
    setSyncedRescanToken(rescanToken);
    setScanProgress(0);
    setScanning(true);
  }

  useEffect(() => {
    if (readOnly || (!shouldScanOnMount && rescanToken === 0)) return;
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
  }, [rescanToken, readOnly, shouldScanOnMount]);

  const handleScan = () => {
    if (readOnly || !canRescan || isRescanning) return;
    onScan?.();
    setRescanToken((t) => t + 1);
  };

  // ── Zoom ──
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
  const zoomReset = () => setZoom(DEFAULT_ZOOM);

  // ── Cursor-following tooltip ──
  // Container width/height travel alongside the cursor position, captured together from
  // the same getBoundingClientRect() call inside the event handler — this project's lint
  // config forbids reading ref.current during render (react-hooks/refs), so the container
  // size can't be read back out of containerRef at render time the way it's read here.
  const [cursor, setCursor] = useState<{ x: number; y: number; containerWidth: number; containerHeight: number } | null>(null);
  const hoveredSegment = segments.find((s) => s.draft_id === hoveredId) ?? null;
  const editableSegment = segments.find((segment) => segment.draft_id === selectedEditId && segmentPolygons(segment).length > 0) ?? null;
  const editablePolygons = editableSegment ? segmentPolygons(editableSegment) : [];
  const editablePolygon = editablePolygons[selectedEditPolygonIndex] ?? editablePolygons[0] ?? null;
  const canEditHighlights = !readOnly && !disableHighlightEditing && !!onSegmentPolygonChange;
  const highlightEditingActive = editingHighlights && canEditHighlights;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, containerWidth: rect.width, containerHeight: rect.height });
  };

  const svgPointFromPointer = (e: React.PointerEvent<SVGElement>): [number, number] | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return [
      Math.min(Math.max(transformed.x, 0), imageWidth),
      Math.min(Math.max(transformed.y, 0), imageHeight),
    ];
  };

  const updatePolygonPoint = (draftId: string, polygonIndex: number, pointIndex: number, point: [number, number]) => {
    const segment = segments.find((seg) => seg.draft_id === draftId);
    const points = segment ? segmentPolygons(segment)[polygonIndex] : null;
    if (!points) return;
    onSegmentPolygonChange?.(
      draftId,
      points.map((existing, index) => (index === pointIndex ? point : existing)),
      polygonIndex,
    );
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const point = svgPointFromPointer(e);
    if (!point) return;
    if (draggingPoint) {
      updatePolygonPoint(draggingPoint.draftId, draggingPoint.polygonIndex, draggingPoint.pointIndex, point);
      return;
    }
    if (draggingShape) {
      const segment = segments.find((seg) => seg.draft_id === draggingShape.draftId);
      const polygon = segment ? segmentPolygons(segment)[draggingShape.polygonIndex] : null;
      if (!polygon) return;
      const dx = point[0] - draggingShape.lastPoint[0];
      const dy = point[1] - draggingShape.lastPoint[1];
      onSegmentPolygonChange?.(
        draggingShape.draftId,
        polygon.map(([x, y]) => [
          Math.min(Math.max(x + dx, 0), imageWidth),
          Math.min(Math.max(y + dy, 0), imageHeight),
        ]),
        draggingShape.polygonIndex,
      );
      setDraggingShape({ ...draggingShape, lastPoint: point });
    }
  };

  const handleSvgPointerUp = () => {
    setDraggingPoint(null);
    setDraggingShape(null);
  };

  const handlePolygonDoubleClick = (e: React.MouseEvent<SVGPolygonElement>, segment: DraftSegment) => {
    if (!highlightEditingActive || segmentPolygons(segment).length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const point = svgPointFromPointer(e as unknown as React.PointerEvent<SVGElement>);
    if (!point) return;
    const polygon = segmentPolygons(segment)[selectedEditPolygonIndex] ?? segmentPolygons(segment)[0];
    onSegmentPolygonChange?.(segment.draft_id, insertPointOnNearestEdge(polygon, point), selectedEditPolygonIndex);
  };

  const tooltipLeft = cursor && cursor.x + TOOLTIP_WIDTH + 20 > cursor.containerWidth ? cursor.x - TOOLTIP_WIDTH - 14 : (cursor?.x ?? 0) + 14;
  const tooltipTop = cursor && cursor.y + TOOLTIP_HEIGHT + 20 > cursor.containerHeight ? cursor.y - TOOLTIP_HEIGHT - 14 : (cursor?.y ?? 0) + 14;

  const scanLineY = (scanProgress / 100) * imageHeight;
  const groupingSelectionPolygons = segments
    .filter((segment) => groupingSelectedIds?.has(segment.draft_id))
    .flatMap(segmentPolygons);
  const segmentPoints = segments.flatMap((seg) => segmentPolygons(seg)).flat();
  const segmentCropBounds =
    segmentPoints.length > 0
      ? segmentPoints.reduce(
          (bounds, [x, y]) => ({
            minX: Math.min(bounds.minX, x),
            minY: Math.min(bounds.minY, y),
            maxX: Math.max(bounds.maxX, x),
            maxY: Math.max(bounds.maxY, y),
          }),
          { minX: imageWidth, minY: imageHeight, maxX: 0, maxY: 0 },
        )
      : null;
  const floorCropBounds = focusBounds
    ? { minX: focusBounds[0], minY: focusBounds[1], maxX: focusBounds[2], maxY: focusBounds[3] }
    : segmentCropBounds;
  const focusMinX = floorCropBounds?.minX ?? imageWidth / 4;
  const focusMinY = floorCropBounds?.minY ?? imageHeight / 4;
  const focusMaxX = floorCropBounds?.maxX ?? (imageWidth * 3) / 4;
  const focusMaxY = floorCropBounds?.maxY ?? (imageHeight * 3) / 4;
  const hasFloorFocus = !!floorCropBounds;
  const focusWidth = hasFloorFocus ? Math.max(focusMaxX - focusMinX, 1) : Math.max(focusMaxX - focusMinX, imageWidth / DEFAULT_CROP_SCALE);
  const focusHeight = hasFloorFocus ? Math.max(focusMaxY - focusMinY, 1) : Math.max(focusMaxY - focusMinY, imageHeight / DEFAULT_CROP_SCALE);
  const cropPadding = Math.max(focusWidth, focusHeight) * FLOOR_CROP_PADDING_RATIO;
  const paddedWidth = Math.min(imageWidth, focusWidth + cropPadding * 2);
  const paddedHeight = Math.min(imageHeight, focusHeight + cropPadding * 2);
  const focusCenterX = (focusMinX + focusMaxX) / 2;
  const focusCenterY = (focusMinY + focusMaxY) / 2;
  const cropScale = Math.max(1, DEFAULT_CROP_SCALE * zoom);
  const minimumCropWidth = hasFloorFocus ? 1 : imageWidth / cropScale;
  const minimumCropHeight = hasFloorFocus ? 1 : imageHeight / cropScale;
  const cropWidth = Math.min(
    imageWidth,
    Math.max(paddedWidth / zoom, minimumCropWidth),
  );
  const cropHeight = Math.min(
    imageHeight,
    Math.max(paddedHeight / zoom, minimumCropHeight),
  );
  const cropX = Math.min(Math.max(focusCenterX - cropWidth / 2, 0), Math.max(imageWidth - cropWidth, 0));
  const cropY = Math.min(Math.max(focusCenterY - cropHeight / 2, 0), Math.max(imageHeight - cropHeight, 0));
  const croppedViewBox = `${cropX} ${cropY} ${cropWidth} ${cropHeight}`;

  return (
    <div className="flex flex-col gap-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-gray-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
              <span className="h-2 w-2 rounded-full" style={{ background: BAND_COLOR.high }} /> High &ge;85%
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
              <span className="h-2 w-2 rounded-full" style={{ background: BAND_COLOR.medium }} /> Medium 60-84%
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
              <span className="h-2 w-2 rounded-full" style={{ background: BAND_COLOR.low }} /> Low &lt;60%
            </span>
          </div>
          <div className="flex flex-wrap shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleScan}
              disabled={!canRescan || isRescanning}
              title={canRescan ? "Scan" : "Saved-file storage is not configured"}
              aria-label="Scan"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ScanLine className={`h-3.5 w-3.5 ${isRescanning ? "animate-pulse" : ""}`} />
            </button>
            {canEditHighlights && (
              <button
                type="button"
                onClick={() => {
                  setEditingHighlights((editing) => !editing);
                  setDraggingPoint(null);
                  setDraggingShape(null);
                  setSelectedEditId(null);
                  setHighlightEditTool("move");
                }}
                title={highlightEditingActive ? "Finish editing highlights" : "Edit Highlights"}
                aria-label={highlightEditingActive ? "Finish editing highlights" : "Edit Highlights"}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                  highlightEditingActive
                    ? "border-primary bg-orange-50 text-primary"
                    : "border-gray-200 bg-white text-gray-500 hover:border-primary hover:text-primary"
                }`}
              >
                {highlightEditingActive ? <Check className="h-3.5 w-3.5" /> : <PenLine className="h-3.5 w-3.5" />}
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
              <button type="button" onClick={zoomReset} title="Reset zoom" aria-label="Reset zoom" className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 transition hover:text-gray-600">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {highlightEditingActive && editableSegment && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-gray-700">
          <span className="max-w-48 truncate font-semibold text-gray-800">{editableSegment.segment_name || "Selected room"}</span>
          <div className="flex overflow-hidden rounded-lg border border-orange-200 bg-white">
            {[
              { id: "move" as const, label: "Move Points", icon: Move, title: "Drag existing corners" },
              { id: "move-shape" as const, label: "Move Shape", icon: Move, title: "Drag the selected highlight as one shape" },
              { id: "add" as const, label: "Add Point", icon: Plus, title: "Click the selected shape to add a corner" },
              { id: "remove" as const, label: "Remove Point", icon: Minus, title: "Click a corner to remove it" },
            ].map((tool) => {
              const Icon = tool.icon;
              const active = highlightEditTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  title={tool.title}
                  onClick={() => {
                    setHighlightEditTool(tool.id);
                    setDraggingPoint(null);
                    setDraggingShape(null);
                  }}
                  className={`flex items-center gap-1 border-r border-orange-100 px-2.5 py-1.5 font-semibold last:border-r-0 ${
                    active ? "bg-primary text-primary-foreground" : "text-gray-600 hover:bg-orange-50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {tool.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Part D — dark-blue canvas (copies Replit's look; the polygon/viewBox rendering
          underneath is unchanged, see the file header contract). */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        className={`relative rounded-xl border ${readOnly ? "overflow-hidden border-gray-200 bg-white" : "overflow-auto border-slate-800 bg-slate-900"}`}
        style={readOnly ? { height: "min(56vh, 520px)" } : { maxHeight: 560 }}
      >
        {topLeftOverlay && <div className="absolute left-2 top-2 z-30 max-w-[calc(100%-1rem)]">{topLeftOverlay}</div>}
        <svg
          ref={svgRef}
          viewBox={croppedViewBox}
          preserveAspectRatio="xMidYMid meet"
          className={readOnly ? "block h-full w-full" : "block h-auto"}
          style={readOnly ? { touchAction: "none" } : { width: "100%", minWidth: "100%", touchAction: highlightEditingActive ? "none" : undefined }}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerLeave={handleSvgPointerUp}
        >
          <image href={imageUrl} x={0} y={0} width={imageWidth} height={imageHeight} />
          <g>
            {segments.map((seg) => {
              const polygons = segmentPolygons(seg);
              if (polygons.length === 0) return null;

              const band = confidenceBand(seg.confidence_score);
              const color = seg.confirmed ? BAND_COLOR.high : BAND_COLOR[band];
              const hovered = hoveredId === seg.draft_id;
              const estimated = seg.boundary_estimated;
              const grouped = polygons.length > 1;
              const groupingSelected = groupingSelectedIds?.has(seg.draft_id) ?? false;

              return polygons.map((points, polygonIndex) => {
                if (points.length < 3) return null;
                const revealed = !scanning || polygonCenterY(points) <= scanLineY;
                const selected = selectedEditId === seg.draft_id && selectedEditPolygonIndex === polygonIndex;
                const showOutline = !grouped || highlightEditingActive || selected;
                const groupedFillGap = grouped && !highlightEditingActive && revealed;

                return (
                  <polygon
                    key={`${seg.draft_id}-${polygonIndex}`}
                    points={pointsToSvg(points)}
                    onMouseEnter={() => onHoverChange(seg.draft_id)}
                    onMouseLeave={() => {
                      if (!highlightEditingActive) onHoverChange(null);
                    }}
                    onClick={() => {
                      if (!highlightEditingActive) return;
                      setSelectedEditId(seg.draft_id);
                      setSelectedEditPolygonIndex(polygonIndex);
                      onHoverChange(seg.draft_id);
                    }}
                    onPointerDown={(e) => {
                      if (!highlightEditingActive || selectedEditId !== seg.draft_id || selectedEditPolygonIndex !== polygonIndex) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const point = svgPointFromPointer(e);
                      if (!point) return;
                      if (highlightEditTool === "add") {
                        onSegmentPolygonChange?.(seg.draft_id, insertPointOnNearestEdge(points, point), polygonIndex);
                        return;
                      }
                      if (highlightEditTool === "move-shape") {
                        setDraggingShape({ draftId: seg.draft_id, polygonIndex, lastPoint: point });
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }
                    }}
                    onDoubleClick={(e) => {
                      setSelectedEditPolygonIndex(polygonIndex);
                      handlePolygonDoubleClick(e, seg);
                    }}
                    fill={color}
                    fillOpacity={groupingSelected ? 0 : hovered || selected ? (estimated ? 0.18 : 0.24) : revealed ? (estimated ? 0.08 : 0.12) : highlightEditingActive ? 0.04 : 0}
                    stroke={color}
                    strokeWidth={
                      groupingSelected
                        ? 0
                        : groupedFillGap
                        ? 10
                        : showOutline
                          ? (hovered || selected || highlightEditingActive ? (estimated ? 5 : 6) : revealed ? (estimated ? 2.5 : 3.5) : 0)
                          : 0
                    }
                    strokeLinejoin="round"
                    strokeOpacity={groupingSelected ? 0 : groupedFillGap ? (hovered ? 0.24 : 0.12) : showOutline ? (hovered || selected ? 0.95 : revealed ? 0.8 : 0) : 0}
                    strokeDasharray={estimated ? "12 8" : undefined}
                    className={`${highlightEditingActive && highlightEditTool === "move-shape" && selected ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} transition-opacity`}
                  />
                );
              });
            })}
          </g>
          <g pointerEvents="none">
            {groupingSelectionPolygons.map((points, index) =>
              points.length >= 3 ? (
                <polygon
                  key={`grouping-selection-${index}`}
                  points={pointsToSvg(points)}
                  fill="#16a34a"
                  fillOpacity={0.24}
                  stroke="#16a34a"
                  strokeWidth={8}
                  strokeLinejoin="round"
                />
              ) : null,
            )}
          </g>
          {highlightEditingActive && editableSegment && editablePolygon && (
            <g>
              {editablePolygon.map(([x, y], index) => (
                <circle
                  key={`${editableSegment.draft_id}-${selectedEditPolygonIndex}-${index}`}
                  cx={x}
                  cy={y}
                  r={10}
                  fill="#ffffff"
                  stroke={editableSegment.confirmed ? BAND_COLOR.high : BAND_COLOR[confidenceBand(editableSegment.confidence_score)]}
                  strokeWidth={4}
                  className="cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onHoverChange(editableSegment.draft_id);
                    if (highlightEditTool === "remove") {
                      if (editablePolygon.length <= 3) return;
                      onSegmentPolygonChange?.(
                        editableSegment.draft_id,
                        editablePolygon.filter((_, pointIndex) => pointIndex !== index),
                        selectedEditPolygonIndex,
                      );
                      return;
                    }
                    if (highlightEditTool !== "move") return;
                    setDraggingPoint({ draftId: editableSegment.draft_id, polygonIndex: selectedEditPolygonIndex, pointIndex: index });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                />
              ))}
            </g>
          )}
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

        {highlightEditingActive && !editableSegment && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-orange-200 bg-white/95 px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm">
            Click a room highlight to edit its shape.
          </div>
        )}

        {hoveredSegment && cursor && (
          <div
            className="pointer-events-none absolute z-10 flex w-52 flex-col gap-1 rounded-lg border border-white/10 bg-slate-800 p-3 text-xs shadow-2xl"
            style={{ left: tooltipLeft, top: tooltipTop }}
          >
            <p className="truncate font-bold text-white">{hoveredSegment.segment_name || "Untitled segment"}</p>
            <p className="text-white/60">{hoveredSegment.area_sqm.toFixed(1)} sqm</p>
          </div>
        )}
      </div>
    </div>
  );
}
