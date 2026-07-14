"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, X } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import { usePricingStrategies, useCheckRuleUsage, stagingId } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useEditableRuleList } from "@/lib/dev/provisional/useEditableRuleList";
import { isPercent, warnContingency, warnMarkup, warnOverhead, warnProfitMargin, warnVat } from "@/lib/dev/provisional/ruleValidation";
import {
  QUOTATION_TIERS,
  type PricingStrategyRule,
  type QuotationTier,
} from "@/lib/dev/provisional/companyRulesTypes";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

interface SliderPercentFieldProps {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  touched: boolean;
  warn?: (n: number) => string | null;
}

// Part F: slider + numeric input (spinners are terrible for percentages), plus a soft
// warning (never blocking) against Philippine norms where a range was actually given.
function SliderPercentField({ label, value, onChange, touched, warn }: SliderPercentFieldProps) {
  const valid = value !== "" && isPercent(Number(value));
  const warning = valid && warn ? warn(Number(value)) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-600">
          {label} <span className="text-red-500">*</span>
        </label>
        <span className="text-xs font-bold text-gray-700">{value === "" ? "—" : `${value}%`}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step="0.1"
          value={value === "" ? 0 : value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 flex-1 accent-primary"
        />
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
        />
      </div>
      {touched && !valid && <p className="text-xs text-red-500">Enter a value between 0 and 100.</p>}
      {warning && (
        <p className="flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {warning}
        </p>
      )}
    </div>
  );
}

interface PricingStrategyFormProps {
  focusRuleId?: string | null;
  onFocusHandled?: () => void;
}

export function PricingStrategyForm({ focusRuleId, onFocusHandled }: PricingStrategyFormProps) {
  const { strategies, isLoading, error, refetch, save, isSaving, saveError, resetSave, update, supersede } =
    usePricingStrategies();
  const { checkUsage } = useCheckRuleUsage();
  const editable = useEditableRuleList<PricingStrategyRule>({ checkUsage, update, supersede, idPrefix: "ps" });
  const allStrategies = editable.applyOverrides([...editable.localExtra, ...strategies]);

  // Part C — seeded from the prop at construction, not synced via effect: a jump always
  // remounts this component fresh (see ScopeTemplatesForm for the full reasoning).
  const [selectedId, setSelectedId] = useState<string | null>(focusRuleId ?? null);
  const [mode, setMode] = useState<"idle" | "add" | "edit">("idle");
  const [tier, setTier] = useState<QuotationTier | "">("");
  const [markup, setMarkup] = useState<number | "">("");
  const [contingency, setContingency] = useState<number | "">("");
  const [overhead, setOverhead] = useState<number | "">("");
  const [profitMargin, setProfitMargin] = useState<number | "">("");
  // Part F: VAT toggle + revealed field — same progressive-disclosure pattern as the
  // SignUp specialization fields. OFF submits 0 (no on/off column exists in the schema —
  // see companyRulesTypes.ts).
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatPercentage, setVatPercentage] = useState<number | "">(12);
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    if (focusRuleId) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tierValid = tier !== "";
  const markupValid = markup !== "" && isPercent(Number(markup));
  const contingencyValid = contingency !== "" && isPercent(Number(contingency));
  const overheadValid = overhead !== "" && isPercent(Number(overhead));
  const profitValid = profitMargin !== "" && isPercent(Number(profitMargin));
  const vatValid = !vatEnabled || (vatPercentage !== "" && isPercent(Number(vatPercentage)));
  const formValid = tierValid && markupValid && contingencyValid && overheadValid && profitValid && vatValid;

  // Part F: one ACTIVE strategy per tier — not a hard tier-count cap. Excludes the rule
  // currently being edited so re-saving the same strategy under its own tier isn't a
  // false conflict.
  const conflictingActive =
    tier !== ""
      ? allStrategies.find((s) => s.quotation_tier === tier && s.is_active && s.rule_id !== (mode === "edit" ? selectedId : null))
      : null;

  const resetForm = () => {
    setTier("");
    setMarkup("");
    setContingency("");
    setOverhead("");
    setProfitMargin("");
    setVatEnabled(false);
    setVatPercentage(12);
    setTouched(false);
  };

  const startAdd = () => {
    setMode("add");
    setSelectedId(null);
    resetForm();
    setSavedMessage(false);
    resetSave();
  };

  const startEdit = (s: PricingStrategyRule) => {
    setMode("edit");
    setTier(s.quotation_tier);
    setMarkup(s.markup_percentage);
    setContingency(s.contingency_percentage);
    setOverhead(s.overhead_percentage);
    setProfitMargin(s.profit_margin_percentage);
    setVatEnabled(s.vat_percentage > 0);
    setVatPercentage(s.vat_percentage > 0 ? s.vat_percentage : 12);
    setTouched(false);
    setSavedMessage(false);
  };

  const buildPayload = () => ({
    quotation_tier: tier as QuotationTier,
    markup_percentage: Number(markup),
    contingency_percentage: Number(contingency),
    overhead_percentage: Number(overhead),
    profit_margin_percentage: Number(profitMargin),
    vat_percentage: vatEnabled ? Number(vatPercentage) : 0,
  });

  const handleSave = async () => {
    setTouched(true);
    if (!formValid || conflictingActive) return;

    if (mode === "edit" && selectedId) {
      const resultId = await editable.saveEdit(selectedId, buildPayload());
      if (resultId) {
        setMode("idle");
        setSelectedId(resultId);
        setSavedMessage(true);
      }
      return;
    }

    try {
      await save(buildPayload());
      const optimistic: PricingStrategyRule = {
        rule_id: stagingId("ps"),
        ...buildPayload(),
        is_active: true,
        effective_date: new Date().toISOString().slice(0, 10),
      };
      editable.addCreated(optimistic);
      setMode("idle");
      setSelectedId(optimistic.rule_id);
      setSavedMessage(true);
    } catch {
      // surfaced via saveError below — no fabricated success
    }
  };

  const selected = allStrategies.find((s) => s.rule_id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Pricing Strategy</h2>
        <p className="text-xs text-gray-500">
          Configure markup, contingency, overhead, profit margin, and VAT rate per quotation tier.
        </p>
      </div>

      <RuleListDetailPanel
        title="Pricing Strategies"
        items={allStrategies}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        getId={(s) => s.rule_id}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setMode("idle");
        }}
        onAdd={startAdd}
        emptyHint="Add a pricing strategy for a quotation tier."
        renderListItem={(s) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-800">{s.quotation_tier} Tier</span>
            <span className="text-xs text-gray-400">{s.markup_percentage}% markup</span>
          </div>
        )}
        detail={
          mode === "add" || mode === "edit" ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">
                  {mode === "edit" ? "Edit Pricing Strategy" : "New Pricing Strategy"}
                </p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {mode === "edit" && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    If this strategy is used by existing quotations, saving will create a
                    new version — those quotations keep their original pricing.
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Quotation Tier <span className="text-red-500">*</span>
                </label>
                <select value={tier} onChange={(e) => setTier(e.target.value as QuotationTier)} className={inputCls}>
                  <option value="">Select…</option>
                  {QUOTATION_TIERS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                {touched && !tierValid && <p className="text-xs text-red-500">Select a tier.</p>}
                {conflictingActive && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      An active {tier} strategy already exists.{" "}
                      <button
                        type="button"
                        onClick={() => startEdit(conflictingActive)}
                        className="font-semibold underline underline-offset-2"
                      >
                        Edit that one instead
                      </button>
                      , or disable it first under Manage Existing Rules.
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <SliderPercentField label="Markup" value={markup} onChange={setMarkup} touched={touched} warn={warnMarkup} />
                <SliderPercentField
                  label="Contingency"
                  value={contingency}
                  onChange={setContingency}
                  touched={touched}
                  warn={warnContingency}
                />
                <SliderPercentField
                  label="Overhead (OCM)"
                  value={overhead}
                  onChange={setOverhead}
                  touched={touched}
                  warn={warnOverhead}
                />
                <SliderPercentField
                  label="Profit Margin"
                  value={profitMargin}
                  onChange={setProfitMargin}
                  touched={touched}
                  warn={warnProfitMargin}
                />
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
                <label className="flex items-center gap-2.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={vatEnabled}
                    onChange={(e) => setVatEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                  />
                  Apply VAT
                </label>
                {vatEnabled && (
                  <SliderPercentField label="VAT Rate" value={vatPercentage} onChange={setVatPercentage} touched={touched} warn={warnVat} />
                )}
                <p className="text-[11px] text-gray-400">
                  VAT is added as a separate line at the bottom of the quotation — it is
                  never folded into the per-sqm price. Whether VAT is actually applied to a
                  given quote is a separate, per-quotation decision — some clients decline
                  VAT because they don&apos;t require an official receipt.
                </p>
              </div>

              {(saveError || editable.saveError) && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t save:{" "}
                  {(saveError ?? editable.saveError)?.message}
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || editable.isSaving || !!conflictingActive}
                className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
              >
                {isSaving || editable.isSaving ? "Saving…" : mode === "edit" ? "Save Changes" : "Save Pricing Strategy"}
              </button>
            </div>
          ) : selected ? (
            <div className="flex flex-col gap-4">
              {savedMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {editable.supersededNotice
                    ? "A new version of this strategy was created — the previous version is preserved for existing quotations."
                    : "Company preferences updated successfully."}
                </div>
              )}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <div>
                  <p className="text-lg font-bold text-gray-900">{selected.quotation_tier} Tier</p>
                  <p className="mt-1 text-[11px] text-gray-400">Effective {selected.effective_date}</p>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(selected)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-primary hover:text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Markup</dt>
                  <dd className="text-gray-700">{selected.markup_percentage}%</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contingency</dt>
                  <dd className="text-gray-700">{selected.contingency_percentage}%</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Overhead</dt>
                  <dd className="text-gray-700">{selected.overhead_percentage}%</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Profit Margin</dt>
                  <dd className="text-gray-700">{selected.profit_margin_percentage}%</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">VAT Rate</dt>
                  <dd className="text-gray-700">
                    {selected.vat_percentage > 0 ? `${selected.vat_percentage}%` : "Not applied"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-400">
              <p className="text-sm">Select a pricing strategy to view it, or add a new one.</p>
            </div>
          )
        }
      />
    </div>
  );
}
