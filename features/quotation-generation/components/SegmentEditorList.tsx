"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  computeAreaFromDimensions,
  confidenceBand,
  createManualSegment,
  mergeSegments,
  type DraftSegment,
  type SegmentEntryMode,
} from "../lib/draftSegment";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const band = confidenceBand(score);
  const cls =
    band === "high"
      ? "bg-green-100 text-green-700"
      : band === "medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{score}%</span>;
}

interface SegmentRowFormProps {
  draft: DraftSegment;
  onSave: (next: DraftSegment) => void;
  onCancel: () => void;
}

// Inline row-edit form — covers both "add a new segment" (Quick Measurement, or a manual
// add on top of a blueprint) and "correct a detected segment's name/area" (blueprint
// validation). "Just enter total sqm" is the default entry mode, per the task's explicit
// ask that it be first-class, not buried behind length x width.
function SegmentRowForm({ draft, onSave, onCancel }: SegmentRowFormProps) {
  const [name, setName] = useState(draft.segment_name);
  const [floor, setFloor] = useState(draft.floor_level);
  const [entryMode, setEntryMode] = useState<SegmentEntryMode>(draft.entry_mode);
  const [length, setLength] = useState<number | "">(draft.length ?? "");
  const [width, setWidth] = useState<number | "">(draft.width ?? "");
  const [totalSqm, setTotalSqm] = useState<number | "">(
    draft.entry_mode === "total_sqm" && draft.area_sqm > 0 ? draft.area_sqm : ""
  );
  const [touched, setTouched] = useState(false);

  const dimsValid = length !== "" && width !== "" && Number(length) > 0 && Number(width) > 0;
  const totalValid = totalSqm !== "" && Number(totalSqm) > 0;
  const areaValid = entryMode === "dimensions" ? dimsValid : totalValid;
  const nameValid = name.trim().length > 0;
  const formValid = nameValid && areaValid;

  const liveArea = entryMode === "dimensions" ? (dimsValid ? computeAreaFromDimensions(Number(length), Number(width)) : null) : totalValid ? Number(totalSqm) : null;

  const handleSave = () => {
    setTouched(true);
    if (!formValid) return;
    onSave({
      ...draft,
      segment_name: name.trim(),
      floor_level: floor,
      entry_mode: entryMode,
      length: entryMode === "dimensions" ? Number(length) : null,
      width: entryMode === "dimensions" ? Number(width) : null,
      area_sqm: entryMode === "dimensions" ? computeAreaFromDimensions(Number(length), Number(width)) : Number(totalSqm),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Segment Name <span className="text-red-500">*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Living Room" className={inputCls} autoFocus />
          {touched && !nameValid && <p className="text-[11px] text-red-500">Required.</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Floor Level <span className="font-normal normal-case text-gray-400">(optional)</span>
          </label>
          <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="e.g. Ground Floor" className={inputCls} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEntryMode("total_sqm")}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              entryMode === "total_sqm" ? "border-primary bg-orange-50 text-primary" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
            }`}
          >
            Total sqm
          </button>
          <button
            type="button"
            onClick={() => setEntryMode("dimensions")}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              entryMode === "dimensions" ? "border-primary bg-orange-50 text-primary" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
            }`}
          >
            Length × Width
          </button>
        </div>

        {entryMode === "total_sqm" ? (
          <div className="flex flex-col gap-1">
            <div className="relative">
              <input
                type="number"
                min={0}
                step="0.01"
                value={totalSqm}
                onChange={(e) => setTotalSqm(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Area"
                className={`${inputCls} pr-14`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">sqm</span>
            </div>
            {touched && !totalValid && <p className="text-[11px] text-red-500">Enter the total area.</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="0.01"
                value={length}
                onChange={(e) => setLength(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Length (m)"
                className={inputCls}
              />
              <span className="shrink-0 text-gray-300">×</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={width}
                onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Width (m)"
                className={inputCls}
              />
            </div>
            {liveArea !== null && <p className="text-[11px] text-gray-400">= {liveArea.toFixed(2)} sqm (auto-calculated)</p>}
            {touched && !dimsValid && <p className="text-[11px] text-red-500">Enter both length and width.</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
        >
          <Check className="h-3.5 w-3.5" /> Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-gray-50"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}

interface SegmentEditorListProps {
  segments: DraftSegment[];
  onChange: (next: DraftSegment[]) => void;
  showConfidence?: boolean;
  addLabel?: string;
  hoveredId?: string | null;
  onHoverChange?: (id: string | null) => void;
}

// Shared editable list: add / edit / delete / group. Used standalone by Quick
// Measurement, and as the side list (synced to BlueprintOverlay's hover state) during
// blueprint validation — the same underlying DraftSegment[] either way.
export function SegmentEditorList({
  segments,
  onChange,
  showConfidence = false,
  addLabel = "Add Segment",
  hoveredId = null,
  onHoverChange,
}: SegmentEditorListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [grouping, setGrouping] = useState(false);
  const [groupName, setGroupName] = useState("");

  const startAdd = () => {
    const draft = createManualSegment();
    onChange([...segments, draft]);
    setEditingId(draft.draft_id);
  };

  const handleSaveRow = (next: DraftSegment) => {
    onChange(segments.map((s) => (s.draft_id === next.draft_id ? next : s)));
    setEditingId(null);
  };

  const handleCancelRow = (draftId: string) => {
    const seg = segments.find((s) => s.draft_id === draftId);
    // A blank in-progress add (never named) is dropped entirely on cancel, rather than
    // left behind as an empty row.
    if (seg && !seg.segment_name.trim()) {
      onChange(segments.filter((s) => s.draft_id !== draftId));
    }
    setEditingId(null);
  };

  const handleDelete = (draftId: string) => {
    onChange(segments.filter((s) => s.draft_id !== draftId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(draftId);
      return next;
    });
  };

  const toggleSelect = (draftId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(draftId)) next.delete(draftId);
      else next.add(draftId);
      return next;
    });
  };

  const handleGroup = () => {
    if (selectedIds.size < 2 || !groupName.trim()) return;
    const toMerge = segments.filter((s) => selectedIds.has(s.draft_id));
    const merged = mergeSegments(toMerge, groupName.trim());
    onChange([...segments.filter((s) => !selectedIds.has(s.draft_id)), merged]);
    setSelectedIds(new Set());
    setGroupName("");
    setGrouping(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Segments ({segments.length})</p>
        <div className="flex items-center gap-2">
          {selectedIds.size >= 2 && !grouping && (
            <button
              type="button"
              onClick={() => setGrouping(true)}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 transition hover:border-primary hover:text-primary"
            >
              <ChevronsUpDown className="h-3 w-3" /> Group {selectedIds.size} Selected
            </button>
          )}
          <button
            type="button"
            onClick={startAdd}
            className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
          >
            <Plus className="h-3 w-3" /> {addLabel}
          </button>
        </div>
      </div>

      {grouping && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-orange-50/50 px-3 py-2">
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Name for the combined segment…"
            className={inputCls}
            autoFocus
          />
          <button
            type="button"
            disabled={!groupName.trim()}
            onClick={handleGroup}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover) disabled:opacity-50"
          >
            Combine
          </button>
          <button
            type="button"
            onClick={() => {
              setGrouping(false);
              setGroupName("");
            }}
            className="shrink-0 text-xs font-semibold text-gray-400 transition hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      )}

      {segments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
          No segments yet — add one to get started.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {segments.map((seg) =>
            editingId === seg.draft_id ? (
              <div key={seg.draft_id} className="p-3">
                <SegmentRowForm draft={seg} onSave={handleSaveRow} onCancel={() => handleCancelRow(seg.draft_id)} />
              </div>
            ) : (
              <div
                key={seg.draft_id}
                onMouseEnter={() => onHoverChange?.(seg.draft_id)}
                onMouseLeave={() => onHoverChange?.(null)}
                className={`flex items-center gap-3 px-3 py-2.5 transition ${hoveredId === seg.draft_id ? "bg-orange-50/60" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(seg.draft_id)}
                  onChange={() => toggleSelect(seg.draft_id)}
                  className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">{seg.segment_name || "Untitled segment"}</p>
                  <p className="text-xs text-gray-400">
                    {seg.floor_level || "—"} · {seg.area_sqm.toFixed(1)} sqm
                  </p>
                </div>
                {showConfidence && <ConfidenceBadge score={seg.confidence_score} />}
                <button
                  type="button"
                  onClick={() => setEditingId(seg.draft_id)}
                  title="Edit"
                  className="shrink-0 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 transition hover:border-primary hover:text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(seg.draft_id)}
                  title="Delete"
                  className="shrink-0 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 transition hover:border-red-300 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
