"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import {
  useLaborRules,
  useLaborTradeOptions,
  stagingId,
} from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { isNonEmpty, isPositiveNumber } from "@/lib/dev/provisional/ruleValidation";
import {
  LABOR_FALLBACK_RULES,
  type LaborFallbackRule,
  type LaborRule,
} from "@/lib/dev/provisional/companyRulesTypes";
import { PH_REGIONS, type PhRegion } from "@/types/entities/common";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

function fmt(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

export function LaborRulesForm() {
  const { rules, isLoading, error, refetch, save, isSaving, saveError, resetSave } = useLaborRules();
  const { options: laborTradeOptions } = useLaborTradeOptions();
  const [localExtra, setLocalExtra] = useState<LaborRule[]>([]);
  const allRules = [...localExtra, ...rules];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [region, setRegion] = useState<PhRegion | "">("");
  const [trade, setTrade] = useState("");
  const [rate, setRate] = useState<number | "">("");
  const [productivity, setProductivity] = useState<number | "">("");
  const [fallback, setFallback] = useState<LaborFallbackRule | "">("");
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  const regionValid = region !== "";
  const tradeValid = isNonEmpty(trade);
  const rateValid = rate !== "" && isPositiveNumber(Number(rate));
  const productivityValid = productivity !== "" && isPositiveNumber(Number(productivity));
  const fallbackValid = fallback !== "";
  const formValid = regionValid && tradeValid && rateValid && productivityValid && fallbackValid;

  const startAdd = () => {
    setAdding(true);
    setSelectedId(null);
    setRegion("");
    setTrade("");
    setRate("");
    setProductivity("");
    setFallback("");
    setTouched(false);
    setSavedMessage(false);
    resetSave();
  };

  const handleSave = async () => {
    setTouched(true);
    if (!formValid) return;
    try {
      await save({
        region: region as PhRegion,
        labor_trade: trade,
        labor_rate: Number(rate),
        productivity_index: Number(productivity),
        fallback_rule: fallback as LaborFallbackRule,
      });
      const optimistic: LaborRule = {
        labor_rule_id: stagingId("lr"),
        region: region as PhRegion,
        labor_trade: trade,
        labor_rate: Number(rate),
        productivity_index: Number(productivity),
        fallback_rule: fallback as LaborFallbackRule,
        status: "Active",
      };
      setLocalExtra((prev) => [optimistic, ...prev]);
      setAdding(false);
      setSelectedId(optimistic.labor_rule_id);
      setSavedMessage(true);
    } catch {
      // surfaced via saveError below — no fabricated success
    }
  };

  const selected = allRules.find((r) => r.labor_rule_id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Labor Rules</h2>
        <p className="text-xs text-gray-500">Set labor rates and productivity by region and trade.</p>
      </div>

      <RuleListDetailPanel
        title="Labor Rules"
        items={allRules}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        getId={(r) => r.labor_rule_id}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setAdding(false);
        }}
        onAdd={startAdd}
        emptyHint="Add a labor rule to set a rate for a region and trade."
        renderListItem={(r) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-800">{r.labor_trade}</span>
            <span className="text-xs text-gray-400">{r.region}</span>
            <span className="text-[10px] text-gray-400">{fmt(r.labor_rate)}/day</span>
          </div>
        )}
        detail={
          adding ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">New Labor Rule</p>
                <button type="button" onClick={() => setAdding(false)} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-600">
                    Region <span className="text-red-500">*</span>
                  </label>
                  <select value={region} onChange={(e) => setRegion(e.target.value as PhRegion)} className={inputCls}>
                    <option value="">Select…</option>
                    {PH_REGIONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  {touched && !regionValid && <p className="text-xs text-red-500">Select a region.</p>}
                </div>
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
                    Labor Rate (₱/day) <span className="text-red-500">*</span>
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
                    Productivity Index <span className="text-red-500">*</span>
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
                  Fallback Rule <span className="text-red-500">*</span>
                </label>
                <select
                  value={fallback}
                  onChange={(e) => setFallback(e.target.value as LaborFallbackRule)}
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  {LABOR_FALLBACK_RULES.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
                {touched && !fallbackValid && <p className="text-xs text-red-500">Select a fallback rule.</p>}
              </div>

              {saveError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t save: {saveError.message}
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
              >
                {isSaving ? "Saving…" : "Save Labor Rule"}
              </button>
            </div>
          ) : selected ? (
            <div className="flex flex-col gap-4">
              {savedMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Company preferences updated successfully.
                </div>
              )}
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <p className="text-lg font-bold text-gray-900">{selected.labor_trade}</p>
                <p className="text-sm text-gray-500">{selected.region}</p>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Rate</dt>
                  <dd className="text-gray-700">{fmt(selected.labor_rate)}/day</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Productivity Index</dt>
                  <dd className="text-gray-700">{selected.productivity_index}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Fallback Rule</dt>
                  <dd className="text-gray-700">{selected.fallback_rule}</dd>
                </div>
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
