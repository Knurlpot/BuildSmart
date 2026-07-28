"use client";

import { isSegmentAreaValid, type DraftSegment } from "../lib/draftSegment";

interface SegmentCompilationPanelProps {
  segments: DraftSegment[];
}

// Part B — fills the dead space beside Quick Measurement's segment list with a persistent
// running total (Replit's "Segment Compilation" panel, referenced for look only). Purely
// presentational: sums/reads the SAME `segments` state QuickMeasurementPanel already owns —
// no data fetching, no new hooks, no API calls.
export function SegmentCompilationPanel({ segments }: SegmentCompilationPanelProps) {
  const validSegments = segments.filter(isSegmentAreaValid);
  const totalArea = Math.round(validSegments.reduce((sum, s) => sum + s.area_sqm, 0) * 100) / 100;

  return (
    <div className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
      <div className="rounded-2xl border-2 border-primary/25 bg-orange-50/70 px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Segment Compilation</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold text-gray-900">{totalArea.toFixed(2)}</span>
          <span className="text-lg font-bold text-gray-500">sqm</span>
        </div>
        {segments.length > 0 && (
          <p className="mt-1.5 text-sm font-semibold text-gray-600">
            {validSegments.length} of {segments.length} segment{segments.length === 1 ? "" : "s"} have an area
          </p>
        )}
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-sm">
        <p className="border-b-2 border-gray-100 px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">
          Segments
        </p>
        {segments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Segments will appear here.</p>
        ) : (
          <div className="flex max-h-96 flex-col divide-y divide-gray-100 overflow-y-auto">
            {segments.map((seg) => {
              const valid = isSegmentAreaValid(seg);
              const pct = totalArea > 0 && valid ? Math.min(100, (seg.area_sqm / totalArea) * 100) : 0;
              return (
                <div key={seg.draft_id} className="flex flex-col gap-1.5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gray-700">{seg.segment_name}</span>
                    <span className={`shrink-0 text-sm font-bold ${valid ? "text-gray-800" : "text-amber-600"}`}>
                      {valid ? `${seg.area_sqm.toFixed(2)} sqm` : "—"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-1.5 rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
