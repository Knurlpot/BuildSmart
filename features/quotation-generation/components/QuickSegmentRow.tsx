"use client";

import { AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { isSegmentAreaValid, SEGMENT_ENTRY_MODE_LABEL, type DraftSegment } from "../lib/draftSegment";

interface QuickSegmentRowProps {
  segment: DraftSegment;
  onEdit: () => void;
  onDelete: () => void;
}

// Part A/D — bigger row, bigger icon touch targets than the shared SegmentEditorList (this
// screen's audience is older, often on a laptop trackpad, not chasing small click targets).
// Part E — a segment always has a name by construction (see QuickMeasurementPanel's
// nextSegmentName) and a 0-area segment is flagged here rather than silently shown as if
// it were fine.
export function QuickSegmentRow({ segment, onEdit, onDelete }: QuickSegmentRowProps) {
  const valid = isSegmentAreaValid(segment);
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold text-gray-900">{segment.segment_name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
          {valid ? (
            <span className="font-bold text-gray-800">{segment.area_sqm.toFixed(2)} sqm</span>
          ) : (
            <span className="flex items-center gap-1 font-semibold text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" /> No area yet
            </span>
          )}
          <span className="text-gray-300">·</span>
          <span>{SEGMENT_ENTRY_MODE_LABEL[segment.entry_mode]}</span>
          {segment.floor_level && (
            <>
              <span className="text-gray-300">·</span>
              <span>{segment.floor_level}</span>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        title="Edit"
        aria-label={`Edit ${segment.segment_name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
      >
        <Pencil className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete"
        aria-label={`Delete ${segment.segment_name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-gray-200 bg-white text-gray-500 transition hover:border-red-300 hover:text-red-500"
      >
        <Trash2 className="h-5 w-5" />
      </button>
    </div>
  );
}