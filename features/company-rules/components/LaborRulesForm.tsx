"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, X } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import {
  useLaborRules,
  useLaborTradeOptions,
  useCheckRuleUsage,
  stagingId,
} from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useEditableRuleList } from "@/lib/dev/provisional/useEditableRuleList";
import { isNonEmpty, isPercent, isPositiveNumber } from "@/lib/dev/provisional/ruleValidation";
import { laborRuleScope, type LaborRule, type LaborRuleScope } from "@/lib/dev/provisional/companyRulesTypes";
import { PH_REGIONS, type PhRegion } from "@/types/entities/common";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

function fmt(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

// Treatment-scoped rules are billed per area (client: "₱500/sqm" example); trade-scoped
// rules are billed as a day rate; a General/fallback rule has no single implied unit.
function rateUnit(scope: LaborRuleScope): string {
  if (scope === "Treatment") return "/sqm";
  if (scope === "Trade") return "/day";
  return "";
}

interface LaborRulesFormProps {
  focusRuleId?: string | null;
  onFocusHandled?: () => void;
}

export function LaborRulesForm({ focusRuleId, onFocusHandled }: LaborRulesFormProps) {
  const { rules, isLoading, error, refetch, save, isSaving, saveError, resetSave, update, supersede } =
    useLaborRules();
  const { checkUsage } = useCheckRuleUsage();
  const editable = useEditableRuleList<LaborRule>({ checkUsage, update, supersede, idPrefix: "lr" });
  const { options: laborTradeOptions } = useLaborTradeOptions();
  const allRules = editable.applyOverrides([...editable.localExtra, ...rules]);

  // seeded from the prop at construction, not synced via effect: a jump always remounts
  // this component fresh (see ScopeTemplatesForm for the full reasoning).
  const [selectedId, setSelectedId] = useState<string | null>(focusRuleId ?? null);
  const [mode, setMode] = useState<"idle" | "add" | "edit">("idle");
  // v6 Correction 1: THREE scopes, not two — a specialty subcontractor keys on the
  // TREATMENT they're applying (one crew, one region); a general contractor keys on TRADE
  // (+ optional region). Exactly one of the three is ever set (matches the schema's
  // chk_rule_labor_scope CHECK).
  const [scope, setScope] = useState<LaborRuleScope>("Treatment");
  const [treatmentType, setTreatmentType] = useState("");
  const [region, setRegion] = useState<PhRegion | "">("");
  const [trade, setTrade] = useState("");
  const [rate, setRate] = useState<number | "">("");
  const [rushMultiplier, setRushMultiplier] = useState<number | "">("");
  const [productivity, setProductivity] = useState<number | "">("");
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    if (focusRuleId) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const treatmentValid = scope !== "Treatment" || isNonEmpty(treatmentType);
  const tradeValid = scope !== "Trade" || isNonEmpty(trade);
  const rateValid = rate !== "" && isPositiveNumber(Number(rate));
  const rushValid = rushMultiplier === "" || isPercent(Number(rushMultiplier));
  const productivityValid = productivity === "" || isPositiveNumber(Number(productivity));
  const formValid = treatmentValid && tradeValid && rateValid && rushValid && productivityValid;

  const resetForm = () => {
    setScope("Treatment");
    setTreatmentType("");
    setRegion("");
    setTrade("");
    setRate("");
    setRushMultiplier("");
    setProductivity("");
    setTouched(false);
  };

  const startAdd = () => {
    setMode("add");
    setSelectedId(null);
    resetForm();
    setSavedMessage(false);
    resetSave();
  };

  const startEdit = (r: LaborRule) => {
    setMode("edit");
    setScope(laborRuleScope(r));
    setTreatmentType(r.treatment_type ?? "");
    setRegion(r.region ?? "");
    setTrade(r.labor_trade ?? "");
    setRate(r.labor_rate);
    setRushMultiplier(r.rush_multiplier_percentage ?? "");
    setProductivity(r.productivity_index ?? "");
    setTouched(false);
    setSavedMessage(false);
  };

  const buildPayload = () => ({
    treatment_type: scope === "Treatment" ? treatmentType : null,
    labor_trade: scope === "Trade" ? trade : null,
    region: scope === "Trade" ? (region === "" ? null : (region as PhRegion)) : null,
    labor_rate: Number(rate),
    rush_multiplier_percentage: rushMultiplier === "" ? null : Number(rushMultiplier),
    productivity_index: productivity === "" ? null : Number(productivity),
  });

  const handleSave = async () => {
    setTouched(true);
    if (!formValid) return;

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
      const optimistic: LaborRule = {
        rule_id: stagingId("lr"),
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

  const selected = allRules.find((r) => r.rule_id === selectedId) ?? null;

  const rushPreview =
    rate !== "" && rushMultiplier !== ""
      ? `e.g. a ₱${Number(rate).toLocaleString()}${rateUnit(scope)} base becomes ₱${Math.round(
          Number(rate) * (1 + Number(rushMultiplier) / 100)
        ).toLocaleString()}${rateUnit(scope)} when the job is rushed.`
      : "Extra charged when a job is rushed — e.g. 25% means a ₱500/sqm base becomes ₱625/sqm.";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Labor Rules</h2>
        <p className="text-xs text-gray-500">
          Set a base labor rate — by treatment type (specialty subcontractor) or by trade
          (general contractor) — plus an optional rush uplift.
        </p>
      </div>

      <RuleListDetailPanel
        title="Labor Rules"
        items={allRules}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        getId={(r) => r.rule_id}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setMode("idle");
        }}
        onAdd={startAdd}
        emptyHint="Add a labor rule scoped by treatment, by trade, or a general fallback rate."
        renderListItem={(r) => {
          const s = laborRuleScope(r);
          return (
            <div className="flex flex-col gap-0.5">
              {s === "Treatment" && <span className="text-sm font-semibold text-gray-800">{r.treatment_type}</span>}
              {s === "Trade" && (
                <span className="text-sm font-semibold text-gray-800">
                  {r.labor_trade}
                  {r.region && ` · ${r.region}`}
                </span>
              )}
              {s === "General" && <span className="text-sm font-semibold text-gray-800">General</span>}
              <span className="text-[10px] text-gray-400">
                {fmt(r.labor_rate)}
                {rateUnit(s)}
                {r.rush_multiplier_percentage !== null && ` (+${r.rush_multiplier_percentage}% rush)`}
              </span>
            </div>
          );
        }}
        detail={
          mode === "add" || mode === "edit" ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">{mode === "edit" ? "Edit Labor Rule" : "New Labor Rule"}</p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {mode === "edit" && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    If this rule is used by existing quotations, saving will create a new
                    version — those quotations keep their original rate.
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">Rule Scope</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setScope("Treatment")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      scope === "Treatment"
                        ? "border-primary bg-orange-50 text-primary"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    By Treatment
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("Trade")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      scope === "Trade"
                        ? "border-primary bg-orange-50 text-primary"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    By Trade
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("General")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      scope === "General"
                        ? "border-primary bg-orange-50 text-primary"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    General
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">
                  {scope === "Treatment" &&
                    "For a specialty subcontractor — the rate varies by which system you're applying (e.g. cementitious vs elastomeric), not by region or trade."}
                  {scope === "Trade" &&
                    "For a general contractor — the rate varies by trade, optionally by region."}
                  {scope === "General" &&
                    "Applies to everything else. A treatment or trade rule always takes precedence over this when one matches."}
                </p>
              </div>

              {scope === "Treatment" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-600">
                    Treatment Type <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={treatmentType}
                    onChange={(e) => setTreatmentType(e.target.value)}
                    placeholder="e.g. Cementitious Waterproofing"
                    className={inputCls}
                  />
                  {touched && !treatmentValid && <p className="text-xs text-red-500">Treatment type is required.</p>}
                </div>
              )}

              {scope === "Trade" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-gray-600">
                      Labor Trade <span className="text-red-500">*</span>
                    </label>
                    <select value={trade} onChange={(e) => setTrade(e.target.value)} className={inputCls}>
                      <option value="">Select…</option>
                      {laborTradeOptions.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    {touched && !tradeValid && <p className="text-xs text-red-500">Select a trade.</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-gray-600">
                      Region <span className="font-normal normal-case text-gray-400">(optional)</span>
                    </label>
                    <select value={region} onChange={(e) => setRegion(e.target.value as PhRegion)} className={inputCls}>
                      <option value="">Any region</option>
                      {PH_REGIONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-600">
                    Labor Rate (₱{rateUnit(scope) || " — unit depends on how you bill"}) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={rate}
                    onChange={(e) => setRate(e.target.value === "" ? "" : Number(e.target.value))}
                    className={inputCls}
                  />
                  {touched && !rateValid && <p className="text-xs text-red-500">Must be greater than 0.</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-600">
                    Productivity Index <span className="font-normal normal-case text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={productivity}
                    onChange={(e) => setProductivity(e.target.value === "" ? "" : Number(e.target.value))}
                    className={inputCls}
                  />
                  {touched && !productivityValid && <p className="text-xs text-red-500">Must be greater than 0.</p>}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Rush Multiplier <span className="font-normal normal-case text-gray-400">(optional)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={rushMultiplier}
                    onChange={(e) => setRushMultiplier(e.target.value === "" ? "" : Number(e.target.value))}
                    className={`${inputCls} pr-8`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                </div>
                {touched && !rushValid && <p className="text-xs text-red-500">Enter a value between 0 and 100.</p>}
                <p className="text-[11px] text-gray-400">{rushPreview}</p>
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
                disabled={isSaving || editable.isSaving}
                className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
              >
                {isSaving || editable.isSaving ? "Saving…" : mode === "edit" ? "Save Changes" : "Save Labor Rule"}
              </button>
            </div>
          ) : selected ? (
            <div className="flex flex-col gap-4">
              {savedMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {editable.supersededNotice
                    ? "A new version of this rule was created — the previous version is preserved for existing quotations."
                    : "Company preferences updated successfully."}
                </div>
              )}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <div>
                  <p className="text-lg font-bold text-gray-900">
                    {laborRuleScope(selected) === "Treatment" && selected.treatment_type}
                    {laborRuleScope(selected) === "Trade" && selected.labor_trade}
                    {laborRuleScope(selected) === "General" && "General Labor Rule"}
                  </p>
                  {laborRuleScope(selected) === "Trade" && (
                    <p className="text-sm text-gray-500">{selected.region ?? "Any region"}</p>
                  )}
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
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Rate</dt>
                  <dd className="text-gray-700">
                    {fmt(selected.labor_rate)}
                    {rateUnit(laborRuleScope(selected))}
                  </dd>
                </div>
                {selected.rush_multiplier_percentage !== null && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Rush Multiplier</dt>
                    <dd className="text-gray-700">+{selected.rush_multiplier_percentage}%</dd>
                  </div>
                )}
                {selected.productivity_index !== null && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Productivity Index</dt>
                    <dd className="text-gray-700">{selected.productivity_index}</dd>
                  </div>
                )}
              </dl>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-400">
              <p className="text-sm">Select a labor rule to view it, or add a new one.</p>
            </div>
          )
        }
      />
    </div>
  );
}