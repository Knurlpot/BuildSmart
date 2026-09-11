"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import { useSaveSegments, useUpdateQuotationInputMethod } from "@/hooks/useQuotationGeneration";
import { apiClient } from "@/lib/api/client";
import { useLaborRules, useMaterialRules } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { laborRuleScope } from "@/lib/dev/provisional/companyRulesTypes";
import { useSiteConditionRules } from "@/hooks/useSiteConditionRules";
import { SITE_CONDITION_FIELDS, siteConditionField, type ProjectSiteCondition, type SiteConditionFieldKey, type SiteConditionRule } from "@/types/entities/site-condition-rule";
import { evaluateSiteConditionRules, isSiteConditionEffectIncluded } from "../lib/siteConditionEngine";
import {
  computeQuotationInputMethod,
  draftSegmentToPayload,
  isSegmentConfigured,
  isSegmentIncluded,
  type DraftSegment,
} from "../lib/draftSegment";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

const AUTOSAVE_DELAY_MS = 1200;

interface SegmentConfigFormProps {
  segment: DraftSegment;
  treatmentOptions: string[];
  laborTradeOptions: string[];
  siteConditionRules: SiteConditionRule[];
  onSave: (patch: Partial<DraftSegment>) => void;
}

// 
function SegmentConfigForm({ segment, treatmentOptions, laborTradeOptions, siteConditionRules, onSave }: SegmentConfigFormProps) {
  const isKnownTreatment = segment.treatment_type !== null && treatmentOptions.includes(segment.treatment_type);
  const [treatmentChoice, setTreatmentChoice] = useState<string>(
    isKnownTreatment ? segment.treatment_type! : segment.treatment_type ? "Other" : ""
  );
  const [customTreatment, setCustomTreatment] = useState(isKnownTreatment ? "" : (segment.treatment_type ?? ""));
  const availableConditionFields = SITE_CONDITION_FIELDS.filter((field) => !(segment.site_conditions ?? []).some((condition) => condition.field === field.key));
  const [conditionToAdd, setConditionToAdd] = useState<SiteConditionFieldKey | "">(availableConditionFields[0]?.key ?? "");
  const effectiveConditionToAdd = conditionToAdd || availableConditionFields[0]?.key || "";
  const triggeredEffects = evaluateSiteConditionRules({ ...segment, site_conditions: segment.site_conditions ?? [], site_condition_effect_decisions: segment.site_condition_effect_decisions ?? {} }, siteConditionRules);

  const commitTreatment = (choice: string, custom: string) => {
    onSave({ treatment_type: choice === "Other" ? custom.trim() || null : choice || null });
  };

  const updateCondition = (field: SiteConditionFieldKey, value: string) => {
    onSave({ site_conditions: (segment.site_conditions ?? []).map((condition) => condition.field === field ? { ...condition, value } : condition) });
  };

  const addCondition = () => {
    if (!effectiveConditionToAdd) return;
    const definition = siteConditionField(effectiveConditionToAdd);
    const condition: ProjectSiteCondition = { field: effectiveConditionToAdd, value: definition?.valueType === "number" ? "1" : definition?.options[0] ?? "" };
    onSave({ site_conditions: [...(segment.site_conditions ?? []), condition] });
    setConditionToAdd(availableConditionFields.find((field) => field.key !== effectiveConditionToAdd)?.key ?? "");
  };

  const removeCondition = (field: SiteConditionFieldKey) => {
    onSave({ site_conditions: (segment.site_conditions ?? []).filter((condition) => condition.field !== field) });
  };

  const setEffectIncluded = (reviewKey: string, included: boolean) => {
    onSave({ site_condition_effect_decisions: { ...(segment.site_condition_effect_decisions ?? {}), [reviewKey]: included } });
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Segment</p>
        <p className="text-sm font-semibold text-gray-800">{segment.segment_name}</p>
        <p className="text-xs text-gray-400">
          {segment.floor_level || "—"} · {segment.area_sqm.toFixed(1)} sqm
          {segment.confidence_score !== null && ` · ${segment.confidence_score}% confidence`}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className={`grid gap-3 ${(segment.labor_basis ?? "Auto") === "Trade" ? "sm:grid-cols-2" : ""}`}>
          <div className="flex min-w-0 flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-600">
            Labor Basis <span className="text-red-500">*</span>
          </label>
          <select
            value={segment.labor_basis ?? "Auto"}
            onChange={(e) => {
              const laborBasis = e.target.value as DraftSegment["labor_basis"];
              onSave({
                labor_basis: laborBasis,
                labor_trade: laborBasis === "Trade" ? segment.labor_trade : null,
              });
            }}
            className={`${inputCls} select-chevron`}
          >
            <option value="Auto">Auto</option>
            <option value="Treatment">By Treatment</option>
            <option value="Trade">By Trade</option>
            <option value="General">General</option>
          </select>
          </div>
          {(segment.labor_basis ?? "Auto") === "Trade" && (
            <div className="flex min-w-0 flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-600">
              Labor Trade <span className="text-red-500">*</span>
            </label>
            <select value={segment.labor_trade ?? ""} onChange={(e) => onSave({ labor_trade: e.target.value || null })} className={`${inputCls} select-chevron`}>
              <option value="">Select…</option>
              {laborTradeOptions.map((trade) => (
                <option key={trade}>{trade}</option>
              ))}
            </select>
            {laborTradeOptions.length === 0 && (
              <p className="text-[11px] text-amber-600">
                Set up an active By Trade labor rule in Preferences &amp; Rules &gt; Labor Rules first.
              </p>
            )}
            {!segment.labor_trade && <p className="text-xs text-amber-600">Required when labor is priced by trade.</p>}
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-1.5">
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
          className={`${inputCls} select-chevron`}
        >
          <option value="">Select…</option>
          {treatmentOptions.map((t) => (
            <option key={t}>{t}</option>
          ))}
          <option value="Other">Others</option>
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
          {treatmentOptions.length === 0 && (
            <p className="text-[11px] text-amber-600">
              Add treatment groups in Preferences &amp; Rules &gt; Material Rules first.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-600">
          Site Conditions <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <div className="space-y-2">
          {(segment.site_conditions ?? []).map((condition) => {
            const definition = siteConditionField(condition.field);
            return (
              <div key={condition.field} className="grid grid-cols-[minmax(130px,0.8fr)_minmax(160px,1fr)_32px] items-center gap-2">
                <span className="text-xs font-medium text-gray-600">{definition?.label}</span>
                {definition?.valueType === "number" ? (
                  <input type="number" min="0" value={condition.value} onChange={(event) => updateCondition(condition.field, event.target.value)} className={inputCls} />
                ) : (
                  <select value={condition.value} onChange={(event) => updateCondition(condition.field, event.target.value)} className={`${inputCls} select-chevron`}>
                    {definition?.options.map((option) => <option key={option}>{option}</option>)}
                  </select>
                )}
                <button type="button" onClick={() => removeCondition(condition.field)} title="Remove condition" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          {availableConditionFields.length > 0 && (
            <div className="flex gap-2">
              <select value={effectiveConditionToAdd} onChange={(event) => setConditionToAdd(event.target.value as SiteConditionFieldKey)} className={`${inputCls} select-chevron`}>
                {availableConditionFields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
              </select>
              <button type="button" onClick={addCondition} className="flex shrink-0 items-center gap-1 rounded-lg border border-primary/30 px-3 text-xs font-bold text-primary hover:bg-orange-50"><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
          )}
        </div>
      </div>

      {(segment.site_conditions ?? []).length > 0 && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-gray-800">Triggered adjustments</p>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Estimator review</span>
          </div>
          {triggeredEffects.length === 0 ? (
            <p className="mt-1 text-xs text-gray-500">No active company rule matches these conditions.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {triggeredEffects.map((effect) => {
                const included = isSiteConditionEffectIncluded(segment, effect.review_key);
                return (
                  <label key={effect.review_key} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${effect.effect_type === "warning" ? "border-amber-200 bg-amber-50" : "border-blue-100 bg-white"}`}>
                    <input type="checkbox" checked={included} onChange={(event) => setEffectIncluded(effect.review_key, event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-1 text-xs font-semibold text-gray-800"><span>{effect.label}</span><span className="text-primary">{effect.computed_amount !== null ? `₱${effect.computed_amount.toLocaleString()}` : effect.effect_type === "productivity" ? `-${effect.percentage ?? 0}% productivity` : effect.effect_type === "schedule" ? `+${effect.schedule_days ?? 0} days` : "Review required"}</span></span>
                      <span className="block text-[11px] text-gray-500">{effect.rule_name} · {effect.condition_label}: {effect.condition_value}{effect.description ? ` · ${effect.description}` : ""}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-600">
          Notes <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <textarea
          value={segment.site_notes}
          onChange={(e) => onSave({ site_notes: e.target.value })}
          rows={2}
          className={`${inputCls} h-25 resize-none`}
        />
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

interface ApplyToAllPanelProps {
  open: boolean;
  segmentCount: number;
  treatmentOptions: string[];
  laborTradeOptions: string[];
  onOpenChange: (open: boolean) => void;
  onApply: (patch: Pick<DraftSegment, "treatment_type" | "labor_basis" | "labor_trade" | "is_rush">) => void;
}

// 
  function ApplyToAllPanel({ open, segmentCount, treatmentOptions, laborTradeOptions, onOpenChange, onApply }: ApplyToAllPanelProps) {
  const [treatmentChoice, setTreatmentChoice] = useState("");
  const [customTreatment, setCustomTreatment] = useState("");
  const [laborBasis, setLaborBasis] = useState<DraftSegment["labor_basis"]>("Auto");
  const [laborTrade, setLaborTrade] = useState("");
  const [isRush, setIsRush] = useState(false);

  const treatmentValid = treatmentChoice === "Other" ? customTreatment.trim().length > 0 : treatmentChoice !== "";
  const laborValid = laborBasis !== "Trade" || laborTrade.trim().length > 0;

  const handleApply = () => {
    if (!treatmentValid || !laborValid) return;
    onApply({
      treatment_type: treatmentChoice === "Other" ? customTreatment.trim() : treatmentChoice,
      labor_basis: laborBasis,
      labor_trade: laborBasis === "Trade" ? laborTrade : null,
      is_rush: isRush,
    });
    onOpenChange(false);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-orange-50/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-bold text-gray-900">Apply to All {segmentCount} Segments</p>
        </div>
        <button type="button" onClick={() => onOpenChange(false)} className="text-xs font-semibold text-gray-400 transition hover:text-gray-600">
          Cancel
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Set a value once and apply it to every segment.
        You can still open any segment afterward and change just that one.
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-600">Treatment Type</label>
        <select value={treatmentChoice} onChange={(e) => setTreatmentChoice(e.target.value)} className={`${inputCls} select-chevron`}>
          <option value="">Select…</option>
          {treatmentOptions.map((t) => (
            <option key={t}>{t}</option>
          ))}
          <option value="Other">Others</option>
        </select>
        {treatmentChoice === "Other" && (
          <input
            value={customTreatment}
            onChange={(e) => setCustomTreatment(e.target.value)}
            placeholder="Describe the treatment"
            className={inputCls}
            autoFocus
          />
        )}
        {treatmentOptions.length === 0 && (
          <p className="text-[11px] text-amber-600">
            Add treatment groups in Preferences &amp; Rules &gt; Material Rules first.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-600">Labor Basis</label>
          <select
            value={laborBasis}
            onChange={(e) => {
              const next = e.target.value as DraftSegment["labor_basis"];
              setLaborBasis(next);
              if (next !== "Trade") setLaborTrade("");
            }}
            className={`${inputCls} select-chevron`}
          >
            <option value="Auto">Auto</option>
            <option value="Treatment">By Treatment</option>
            <option value="Trade">By Trade</option>
            <option value="General">General</option>
          </select>
        </div>
        {laborBasis === "Trade" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-600">
              Labor Trade <span className="text-red-500">*</span>
            </label>
            <select value={laborTrade} onChange={(e) => setLaborTrade(e.target.value)} className={`${inputCls} select-chevron`}>
              <option value="">Select…</option>
              {laborTradeOptions.map((trade) => (
                <option key={trade}>{trade}</option>
              ))}
            </select>
            {laborTradeOptions.length === 0 && (
              <p className="text-[11px] text-amber-600">
                Set up an active By Trade labor rule in Preferences &amp; Rules &gt; Labor Rules first.
              </p>
            )}
            {!laborValid && <p className="text-xs text-amber-600">Select a trade to apply by trade.</p>}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2.5 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={isRush}
          onChange={(e) => setIsRush(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
        />
        Rush job
      </label>

      <button
        type="button"
        disabled={!treatmentValid || !laborValid}
        onClick={handleApply}
        className="w-fit rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover) disabled:opacity-50"
      >
        Apply to {segmentCount} Segment{segmentCount === 1 ? "" : "s"}
      </button>
    </div>
  );
}

interface ConfigureSegmentsStepProps {
  quoteId: number;
  segments: DraftSegment[];
  onChange: (next: DraftSegment[]) => void;
  onSaved: (savedCount: number) => void;
  onBack: () => void;
}

export function ConfigureSegmentsStep({ quoteId, segments, onChange, onSaved, onBack }: ConfigureSegmentsStepProps) {
  const { saveSegments, isSaving, saveError } = useSaveSegments();
  const { updateInputMethod } = useUpdateQuotationInputMethod();
  const { rules: materialRules } = useMaterialRules();
  const { rules: laborRules } = useLaborRules();
  const { rules: siteConditionRules } = useSiteConditionRules();
  const [selectedId, setSelectedId] = useState<string | null>(segments[0]?.draft_id ?? null);
  const [applyAllOpen, setApplyAllOpen] = useState(false);
  const [applyRevision, setApplyRevision] = useState(0);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autosaveVersion = useRef(0);

  // 
  const includedSegments = segments.filter(isSegmentIncluded);
  const configuredCount = includedSegments.filter(isSegmentConfigured).length;
  const allConfigured = includedSegments.length > 0 && configuredCount === includedSegments.length;
  const selected = segments.find((s) => s.draft_id === selectedId) ?? null;
  const treatmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          materialRules
            .filter((rule) => rule.is_active)
            .map((rule) => rule.treatment_type?.trim())
            .filter((value): value is string => !!value)
        )
      ).sort(),
    [materialRules]
  );
  const treatmentOptionsKey = treatmentOptions.join("|");
  const laborTradeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          laborRules
            .filter((rule) => rule.is_active && laborRuleScope(rule) === "Trade")
            .map((rule) => rule.labor_trade?.trim())
            .filter((value): value is string => !!value)
        )
      ).sort(),
    [laborRules]
  );

  const updateSegment = (draftId: string, patch: Partial<DraftSegment>) => {
    onChange(segments.map((s) => (s.draft_id === draftId ? { ...s, ...patch } : s)));
  };

  const applyToAll = (patch: Pick<DraftSegment, "treatment_type" | "labor_basis" | "labor_trade" | "is_rush">) => {
    onChange(segments.map((s) => ({ ...s, ...patch })));
    setApplyRevision((r) => r + 1);
  };

  const saveDraftSegments = async () => {
    if (segments.length === 0) return;
    await apiClient<{ saved_count: number }>(`/api/quotations/${quoteId}/segments`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments: segments.map(draftSegmentToPayload) }),
    });
  };

  const handleSave = async () => {
    if (!allConfigured) return;
    try {
      const inputMethod = computeQuotationInputMethod(segments);
      if (inputMethod === "Hybrid") {
          // 
        await updateInputMethod(quoteId, "Hybrid").catch(() => {});
      }
      const result = await saveSegments(quoteId, segments.map(draftSegmentToPayload));
      onSaved(result.saved_count);
    } catch {
      // surfaced via saveError below — no fabricated success
    }
  };

  const handleBack = async () => {
    try {
      setAutosaveState("saving");
      await saveDraftSegments();
      setAutosaveState("saved");
    } catch {
      setAutosaveState("error");
    } finally {
      onBack();
    }
  };

  useEffect(() => {
    if (segments.length === 0) return;
    const version = autosaveVersion.current + 1;
    autosaveVersion.current = version;

    const timer = window.setTimeout(() => {
      setAutosaveState("saving");
      apiClient<{ saved_count: number }>(`/api/quotations/${quoteId}/segments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: segments.map(draftSegmentToPayload) }),
      })
        .then(() => {
          if (autosaveVersion.current === version) setAutosaveState("saved");
        })
        .catch(() => {
          if (autosaveVersion.current === version) setAutosaveState("error");
        });
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [quoteId, segments]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => void handleBack()}
          title="Back"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-base font-bold text-gray-900">Configure Each Segment</h2>
          <p className="text-xs text-gray-500">
            {configuredCount} of {includedSegments.length} included segments configured.
          </p>
          {autosaveState !== "idle" && (
            <p className={`mt-1 text-xs ${autosaveState === "error" ? "text-red-500" : "text-gray-400"}`}>
              {autosaveState === "saving" && "Saving draft..."}
              {autosaveState === "saved" && "Draft saved automatically."}
              {autosaveState === "error" && "Draft autosave failed. Use Save Segments before leaving."}
            </p>
          )}
        </div>
      </div>

      <ApplyToAllPanel
        open={applyAllOpen}
        segmentCount={segments.length}
        treatmentOptions={treatmentOptions}
        laborTradeOptions={laborTradeOptions}
        onOpenChange={setApplyAllOpen}
        onApply={applyToAll}
      />


      <div className="flex h-[450px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex w-68 shrink-0 flex-col border-r border-gray-100">
          <div className="flex min-h-14 items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Segments ({segments.length})</p>
            <button
              type="button"
              onClick={() => setApplyAllOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-primary/40 bg-orange-50/40 px-2 py-1.5 text-[11px] font-bold text-primary transition hover:bg-orange-50"
            >
              <Zap className="h-3.5 w-3.5" /> Apply to All
            </button>
          </div>
          <div className="flex-1 divide-y divide-gray-50 overflow-y-auto">
            {segments.map((seg) => {
              const included = isSegmentIncluded(seg);
              const configured = isSegmentConfigured(seg);
              const isSelected = seg.draft_id === selectedId;
              return (
                <button
                  key={seg.draft_id}
                  type="button"
                  onClick={() => setSelectedId(seg.draft_id)}
                  className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition ${
                    isSelected ? "bg-orange-50/60" : "hover:bg-gray-50"
                  } ${!included ? "opacity-60" : ""}`}
                >
                  {!included ? (
                    <Circle className="h-4 w-4 shrink-0 text-gray-300" />
                  ) : configured ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800">{seg.segment_name}</p>
                    <p className="text-xs text-gray-400">
                      {seg.floor_level || "—"} · {seg.area_sqm.toFixed(1)} sqm
                      {!included && <span className="ml-1.5 font-semibold text-gray-400">· Excluded</span>}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {selected ? (
            <SegmentConfigForm
              key={`${selected.draft_id}-${treatmentOptionsKey}-${applyRevision}`}
              segment={selected}
              treatmentOptions={treatmentOptions}
              laborTradeOptions={laborTradeOptions}
              siteConditionRules={siteConditionRules}
              onSave={(patch) => updateSegment(selected.draft_id, patch)}
            />
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
        {isSaving
          ? "Saving…"
          : allConfigured
            ? `Save ${segments.length} Segments`
            : `Configure all included segments to continue (${configuredCount}/${includedSegments.length})`}
      </button>
    </div>
  );
}
