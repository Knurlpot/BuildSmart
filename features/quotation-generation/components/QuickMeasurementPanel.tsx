"use client";

import { useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { QuickSegmentEditor } from "./QuickSegmentEditor";
import { QuickSegmentRow } from "./QuickSegmentRow";
import { SegmentCompilationPanel } from "./SegmentCompilationPanel";
import { createManualSegment, isSegmentAreaValid, type DraftSegment } from "../lib/draftSegment";

interface QuickMeasurementPanelProps {
  segments: DraftSegment[];
  onChange: (next: DraftSegment[]) => void;
  onContinue: () => void;
  onBack: () => void;
}

// 
function nextSegmentName(segments: DraftSegment[]): string {
  const existingNames = new Set(segments.map((s) => s.segment_name));
  let n = segments.length + 1;
  while (existingNames.has(`Segment ${n}`)) n++;
  return `Segment ${n}`;
}

// 
  export function QuickMeasurementPanel({ segments, onChange, onContinue, onBack }: QuickMeasurementPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const validSegments = segments.filter(isSegmentAreaValid);
  const hasValidSegment = validSegments.length > 0;

  const continueHint = !hasValidSegment
    ? segments.length === 0
      ? "Add at least one segment to continue."
      : "Enter a measurement for at least one segment to continue."
    : null;

  const handleAdd = () => {
    const draft = createManualSegment(nextSegmentName(segments));
    onChange([...segments, draft]);
    setEditingId(draft.draft_id);
  };

  const handleSaveRow = (next: DraftSegment) => {
    onChange(segments.map((s) => (s.draft_id === next.draft_id ? next : s)));
    setEditingId(null);
  };

  const handleCancelRow = (draftId: string) => {
    const seg = segments.find((s) => s.draft_id === draftId);
    if (seg && seg.area_sqm === 0) {
      onChange(segments.filter((s) => s.draft_id !== draftId));
    }
    setEditingId(null);
  };

  const handleDelete = (draftId: string) => {
    onChange(segments.filter((s) => s.draft_id !== draftId));
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            title="Back"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-base font-bold text-gray-900">Quick Measurement</h2>
            <p className="text-sm text-gray-600">
              Add each area you measured on-site.
            </p>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b-2 border-gray-100 px-5 py-4">
            <p className="text-sm font-bold uppercase tracking-wider text-gray-500">Segments ({segments.length})</p>
            <button
              type="button"
              onClick={handleAdd}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
            >
              <Plus className="h-4 w-4" /> Add Segment
            </button>
          </div>

          {segments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <p className="text-base text-gray-500">No segments yet. Add one to get started.</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y-2 divide-gray-100">
              {segments.map((seg) =>
                editingId === seg.draft_id ? (
                  <div key={seg.draft_id} className="p-4">
                    <QuickSegmentEditor draft={seg} onSave={handleSaveRow} onCancel={() => handleCancelRow(seg.draft_id)} />
                  </div>
                ) : (
                  <QuickSegmentRow
                    key={seg.draft_id}
                    segment={seg}
                    onEdit={() => setEditingId(seg.draft_id)}
                    onDelete={() => handleDelete(seg.draft_id)}
                  />
                )
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onContinue}
            disabled={!hasValidSegment}
            aria-describedby={continueHint ? "quick-measurement-continue-hint" : undefined}
            className="w-fit rounded-xl bg-primary px-6 py-3.5 text-base font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue with {segments.length} Segment{segments.length === 1 ? "" : "s"}
          </button>
          {continueHint && (
            <p id="quick-measurement-continue-hint" className="text-sm text-gray-500">
              {continueHint}
            </p>
          )}
        </div>
      </div>
        <SegmentCompilationPanel segments={segments} />
    </div>
  );
}
