"use client";

import { SegmentEditorList } from "./SegmentEditorList";
import type { DraftSegment } from "../lib/draftSegment";

interface QuickMeasurementPanelProps {
  segments: DraftSegment[];
  onChange: (next: DraftSegment[]) => void;
  onContinue: () => void;
}

// Path A — the PRIMARY path: on-site measurement, entered after the fact. No extraction,
// no overlay, no confidence UI (source_method is always 'Manual', confidence_score always
// null) — see draftSegment.ts's createManualSegment.
export function QuickMeasurementPanel({ segments, onChange, onContinue }: QuickMeasurementPanelProps) {
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <h2 className="text-base font-bold text-gray-900">Quick Measurement</h2>
        <p className="text-xs text-gray-500">
          Add each area you measured on-site. Most waterproofing jobs are a single total
          area — &quot;Total sqm&quot; is the fast option; use Length × Width only when you
          have both dimensions handy.
        </p>
      </div>

      <SegmentEditorList segments={segments} onChange={onChange} addLabel="Add Segment" />

      <button
        type="button"
        onClick={onContinue}
        disabled={segments.length === 0}
        className="w-fit rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
      >
        Continue with {segments.length} Segment{segments.length === 1 ? "" : "s"}
      </button>
    </div>
  );
}
