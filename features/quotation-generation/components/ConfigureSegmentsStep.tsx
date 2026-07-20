"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { useSaveSegments, useUpdateQuotationInputMethod } from "@/hooks/useQuotationGeneration";
import { TREATMENT_TYPES } from "@/lib/dev/provisional/quotationGenerationTypes";
import { SEGMENT_CONDITION_TAGS, type SegmentConditionTag } from "@/types/entities/segment-tag";
import {
  computeQuotationInputMethod,
  draftSegmentToPayload,
  isSegmentConfigured,
  type DraftSegment,
} from "../lib/draftSegment";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

interface SegmentConfigFormProps {
  segment: DraftSegment;
  onSave: (patch: Partial<DraftSegment>) => void;
}

// Remounted via `key={segment.draft_id}` by the caller on every selection change, so the
// treatment-type "Other" local state never leaks between segments. Every field commits
// immediately (no per-segment Save button) — completeness is judged at the list level via
// isSegmentConfigured, and the wizard's own "Save N Segments" action is the real commit
// point.
function SegmentConfigForm({ segment, onSave }: SegmentConfigFormProps) {
  const isKnownTreatment = segment.treatment_type !== null && (TREATMENT_TYPES as readonly string[]).includes(segment.treatment_type);
  const [treatmentChoice, setTreatmentChoice] = useState<string>(
    isKnownTreatment ? segment.treatment_type! : segment.treatment_type ? "Other" : ""
  );
  const [customTreatment, setCustomTreatment] = useState(isKnownTreatment ? "" : (segment.treatment_type ?? ""));

  const commitTreatment = (choice: string, custom: string) => {
    onSave({ treatment_type: choice === "Other" ? custom.trim() || null : choice || null });
  };

  const toggleTag = (tag: SegmentConditionTag) => {
    onSave({
      condition_tags: segment.condition_tags.includes(tag)
        ? segment.condition_tags.filter((t) => t !== tag)
        : [...segment.condition_tags, tag],
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Segment</p>
        <p className="text-sm font-semibold text-gray-800">{segment.segment_name}</p>
        <p className="text-xs text-gray-400">
          {segment.floor_level || "—"} · {segment.area_sqm.toFixed(1)} sqm
          {segment.confidence_score !== null && ` · ${segment.confidence_score}% confidence`}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-600">
          Treatment Type <span className="text-red-500">*</span>
        </label>
        <select
          value={treatmentChoice}
          onChange={(e) => {
            const next = e.target.value;
            setTreatmentChoice(next);
            commitTreatment(next, customTreatment);
          }}
          className={inputCls}
        >
          <option value="">Select…</option>
          {TREATMENT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
          <option value="Other">Other…</option>
        </select>
        {treatmentChoice === "Other" && (
          <input
            value={customTreatment}
            onChange={(e) => {
              setCustomTreatment(e.target.value);
              commitTreatment("Other", e.target.value);
            }}
            placeholder="Describe the treatment"
            className={inputCls}
            autoFocus
          />
        )}
        {!segment.treatment_type && <p className="text-xs text-amber-600">Required before this segment can be saved.</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-600">
          Site Conditions <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {SEGMENT_CONDITION_TAGS.map((tag) => {
            const checked = segment.condition_tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  checked ? "border-primary bg-orange-50 text-primary" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-600">
          Notes <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <textarea
          value={segment.site_notes}
          onChange={(e) => onSave({ site_notes: e.target.value })}
          rows={3}
          placeholder="Anything worth flagging about this area's condition…"
          className={`${inputCls} resize-none`}
        />
        <p className="text-[11px] text-gray-400">
          Descriptive only — nothing here derives a surcharge. Pricing adjustments for site
          conditions happen later, when the estimator sets the rate.
        </p>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={segment.is_rush}
          onChange={(e) => onSave({ is_rush: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
        />
        Rush job
      </label>
    </div>
  );
}

interface ConfigureSegmentsStepProps {
  quoteId: number;
  segments: DraftSegment[];
  onChange: (next: DraftSegment[]) => void;
  onSaved: (savedCount: number) => void;
}

export function ConfigureSegmentsStep({ quoteId, segments, onChange, onSaved }: ConfigureSegmentsStepProps) {
  const { saveSegments, isSaving, saveError } = useSaveSegments();
  const { updateInputMethod } = useUpdateQuotationInputMethod();
  const [selectedId, setSelectedId] = useState<string | null>(segments[0]?.draft_id ?? null);

  const configuredCount = segments.filter(isSegmentConfigured).length;
  const allConfigured = segments.length > 0 && configuredCount === segments.length;
  const selected = segments.find((s) => s.draft_id === selectedId) ?? null;

  const updateSegment = (draftId: string, patch: Partial<DraftSegment>) => {
    onChange(segments.map((s) => (s.draft_id === draftId ? { ...s, ...patch } : s)));
  };

  const handleSave = async () => {
    if (!allConfigured) return;
    try {
      const inputMethod = computeQuotationInputMethod(segments);
      if (inputMethod === "Hybrid") {
        // Best-effort correction — the segments save below is what actually matters for
        // Part 1's "done" state, so a failure here doesn't block it.
        await updateInputMethod(quoteId, "Hybrid").catch(() => {});
      }
      const result = await saveSegments(quoteId, segments.map(draftSegmentToPayload));
      onSaved(result.saved_count);
    } catch {
      // surfaced via saveError below — no fabricated success
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Configure Each Segment</h2>
        <p className="text-xs text-gray-500">
          {configuredCount} of {segments.length} configured — a treatment type is required
          on every segment before you can continue.
        </p>
      </div>

      <div className="flex overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" style={{ minHeight: 440 }}>
        <div className="flex w-80 shrink-0 flex-col border-r border-gray-100">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Segments ({segments.length})</p>
          </div>
          <div className="flex-1 divide-y divide-gray-50 overflow-y-auto">
            {segments.map((seg) => {
              const configured = isSegmentConfigured(seg);
              const isSelected = seg.draft_id === selectedId;
              return (
                <button
                  key={seg.draft_id}
                  type="button"
                  onClick={() => setSelectedId(seg.draft_id)}
                  className={`flex w-full items-center gap-2.5 px-4 py-3 text-left transition ${
                    isSelected ? "bg-orange-50/60" : "hover:bg-gray-50"
                  }`}
                >
                  {configured ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800">{seg.segment_name}</p>
                    <p className="text-xs text-gray-400">
                      {seg.floor_level || "—"} · {seg.area_sqm.toFixed(1)} sqm
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {selected ? (
            <SegmentConfigForm key={selected.draft_id} segment={selected} onSave={(patch) => updateSegment(selected.draft_id, patch)} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">No segments to configure.</div>
          )}
        </div>
      </div>

      {saveError && (
        <p className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t save segments: {saveError.message}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!allConfigured || isSaving}
        className="w-fit rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
      >
        {isSaving ? "Saving…" : allConfigured ? `Save ${segments.length} Segments` : `Configure all segments to continue (${configuredCount}/${segments.length})`}
      </button>
    </div>
  );
}
