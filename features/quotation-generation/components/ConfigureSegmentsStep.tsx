"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, Circle, Sparkles, Zap } from "lucide-react";
import { useSaveSegments, useUpdateQuotationInputMethod } from "@/hooks/useQuotationGeneration";
import { apiClient } from "@/lib/api/client";
import { useLaborRules, useMaterialRules } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { laborRuleScope } from "@/lib/dev/provisional/companyRulesTypes";
import { PROJECT_ADJUSTMENT_OPTIONS, type ProjectAdjustmentOption } from "@/types/entities/segment-tag";
import {
  computeQuotationInputMethod,
  draftSegmentToPayload,
  isSegmentConfigured,
  isSegmentIncluded,
  type DraftSegment,
} from "../lib/draftSegment";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";
const priceInputCls = `${inputCls} appearance-none pl-8 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

const AUTOSAVE_DELAY_MS = 1200;

function cleanCurrencyInput(value: string): string {
  const withoutPrefix = value.replace(/^[p₱]/i, "").replace(/,/g, "");
  if (withoutPrefix !== "" && !/^\d*\.?\d{0,2}$/.test(withoutPrefix)) return "";
  return withoutPrefix;
}

function formatCurrencyWhileTyping(value: string): string {
  if (value === "") return "";
  const [integerPart = "", decimalPart] = value.split(".");
  const formattedInteger = Number(integerPart || "0").toLocaleString("en-PH");
  return decimalPart === undefined ? formattedInteger : `${formattedInteger}.${decimalPart}`;
}

function formatPesoInput(value: string | number): string | "" {
  const numeric = Number(String(value).replace(/^[p₱]/i, "").replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return numeric.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface SegmentConfigFormProps {
  segment: DraftSegment;
  treatmentOptions: string[];
  laborTradeOptions: string[];
  onSave: (patch: Partial<DraftSegment>) => void;
}

// 
function SegmentConfigForm({ segment, treatmentOptions, laborTradeOptions, onSave }: SegmentConfigFormProps) {
  const isKnownTreatment = segment.treatment_type !== null && treatmentOptions.includes(segment.treatment_type);
  const projectAdjustments = segment.project_adjustments ?? [];
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [treatmentChoice, setTreatmentChoice] = useState<string>(
    isKnownTreatment ? segment.treatment_type! : segment.treatment_type ? "Other" : ""
  );
  const [customTreatment, setCustomTreatment] = useState(isKnownTreatment ? "" : (segment.treatment_type ?? ""));

  const commitTreatment = (choice: string, custom: string) => {
    onSave({ treatment_type: choice === "Other" ? custom.trim() || null : choice || null });
  };

  const toggleAdjustment = (condition: ProjectAdjustmentOption) => {
    const selected = projectAdjustments.some((adjustment) => adjustment.condition === condition);
    onSave({
      project_adjustments: selected
        ? projectAdjustments.filter((adjustment) => adjustment.condition !== condition)
        : [...projectAdjustments, { condition, amount: "" }],
    });
  };

  const updateAdjustmentAmount = (condition: ProjectAdjustmentOption, value: string) => {
    const cleaned = cleanCurrencyInput(value);
    if (value !== "" && cleaned === "") return;
    onSave({
      project_adjustments: projectAdjustments.map((adjustment) =>
        adjustment.condition === condition ? { ...adjustment, amount: formatCurrencyWhileTyping(cleaned) } : adjustment
      ),
    });
  };

  const formatAdjustmentAmount = (condition: ProjectAdjustmentOption, value: string | number) => {
    onSave({
      project_adjustments: projectAdjustments.map((adjustment) =>
        adjustment.condition === condition ? { ...adjustment, amount: formatPesoInput(value) } : adjustment
      ),
    });
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
          Site Conditions &amp; Project Adjustments <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setConditionsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm text-gray-700 transition hover:border-gray-300"
          >
            <span>{projectAdjustments.length > 0 ? `${projectAdjustments.length} selected` : "Select site conditions"}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition ${conditionsOpen ? "rotate-180" : ""}`} />
          </button>
          {conditionsOpen && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
              {PROJECT_ADJUSTMENT_OPTIONS.map((condition) => {
                const checked = projectAdjustments.some((item) => item.condition === condition);
                return (
                  <label key={condition} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAdjustment(condition)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="leading-5">{condition}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        {!conditionsOpen && projectAdjustments.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {projectAdjustments.map((adjustment) => (
              <label key={adjustment.condition} className="space-y-1 rounded-lg border border-primary/30 bg-orange-50/40 p-2 text-xs font-semibold text-gray-700">
                <span>{adjustment.condition}</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">₱</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={adjustment.amount}
                    onChange={(event) => updateAdjustmentAmount(adjustment.condition, event.target.value)}
                    onBlur={() => formatAdjustmentAmount(adjustment.condition, adjustment.amount)}
                    className={priceInputCls}
                    placeholder="0.00"
                  />
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

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
  onApply: (patch: Pick<DraftSegment, "treatment_type" | "labor_basis" | "labor_trade" | "project_adjustments" | "is_rush">) => void;
}

// 
  function ApplyToAllPanel({ open, segmentCount, treatmentOptions, laborTradeOptions, onOpenChange, onApply }: ApplyToAllPanelProps) {
  const [treatmentChoice, setTreatmentChoice] = useState("");
  const [customTreatment, setCustomTreatment] = useState("");
  const [laborBasis, setLaborBasis] = useState<DraftSegment["labor_basis"]>("Auto");
  const [laborTrade, setLaborTrade] = useState("");
  const [adjustments, setAdjustments] = useState<DraftSegment["project_adjustments"]>([]);
  const [isRush, setIsRush] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(false);

  const toggleAdjustment = (condition: ProjectAdjustmentOption) => {
    setAdjustments((prev) =>
      prev.some((adjustment) => adjustment.condition === condition)
        ? prev.filter((adjustment) => adjustment.condition !== condition)
        : [...prev, { condition, amount: "" }]
    );
  };

  const updateAdjustmentAmount = (condition: ProjectAdjustmentOption, value: string) => {
    const cleaned = cleanCurrencyInput(value);
    if (value !== "" && cleaned === "") return;
    setAdjustments((prev) =>
      prev.map((adjustment) =>
        adjustment.condition === condition ? { ...adjustment, amount: formatCurrencyWhileTyping(cleaned) } : adjustment
      )
    );
  };

  const formatAdjustmentAmount = (condition: ProjectAdjustmentOption, value: string | number) => {
    setAdjustments((prev) =>
      prev.map((adjustment) =>
        adjustment.condition === condition ? { ...adjustment, amount: formatPesoInput(value) } : adjustment
      )
    );
  };

  const treatmentValid = treatmentChoice === "Other" ? customTreatment.trim().length > 0 : treatmentChoice !== "";
  const laborValid = laborBasis !== "Trade" || laborTrade.trim().length > 0;

  const handleApply = () => {
    if (!treatmentValid || !laborValid) return;
    onApply({
      treatment_type: treatmentChoice === "Other" ? customTreatment.trim() : treatmentChoice,
      labor_basis: laborBasis,
      labor_trade: laborBasis === "Trade" ? laborTrade : null,
      project_adjustments: adjustments,
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

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-600">
          Site Conditions &amp; Project Adjustments <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setConditionsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 transition hover:border-gray-300"
          >
            <span>{adjustments.length > 0 ? `${adjustments.length} selected` : "Select site conditions"}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition ${conditionsOpen ? "rotate-180" : ""}`} />
          </button>
          {conditionsOpen && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
              {PROJECT_ADJUSTMENT_OPTIONS.map((condition) => {
                const checked = adjustments.some((item) => item.condition === condition);
                return (
                  <label key={condition} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAdjustment(condition)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="leading-5">{condition}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        {!conditionsOpen && adjustments.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {adjustments.map((adjustment) => (
              <label key={adjustment.condition} className="space-y-1 rounded-lg border border-primary/30 bg-white p-2 text-xs font-semibold text-gray-700">
                <span>{adjustment.condition}</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">₱</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={adjustment.amount}
                    onChange={(event) => updateAdjustmentAmount(adjustment.condition, event.target.value)}
                    onBlur={() => formatAdjustmentAmount(adjustment.condition, adjustment.amount)}
                    className={priceInputCls}
                    placeholder="0.00"
                  />
                </span>
              </label>
            ))}
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

  const applyToAll = (patch: Pick<DraftSegment, "treatment_type" | "labor_basis" | "labor_trade" | "project_adjustments" | "is_rush">) => {
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
