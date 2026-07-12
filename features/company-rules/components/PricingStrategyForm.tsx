"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import { usePricingStrategies, stagingId } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { isPercent } from "@/lib/dev/provisional/ruleValidation";
import {
  QUOTATION_TIERS,
  type PricingStrategyRule,
  type QuotationTier,
} from "@/lib/dev/provisional/companyRulesTypes";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

interface PercentFieldProps {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  touched: boolean;
}

function PercentField({ label, value, onChange, touched }: PercentFieldProps) {
  const valid = value !== "" && isPercent(Number(value));
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-600">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className={`${inputCls} pr-8`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
      </div>
      {touched && !valid && <p className="text-xs text-red-500">Enter a value between 0 and 100.</p>}
    </div>
  );
}

export function PricingStrategyForm() {
  const { strategies, isLoading, error, refetch, save, isSaving, saveError, resetSave } = usePricingStrategies();
  const [localExtra, setLocalExtra] = useState<PricingStrategyRule[]>([]);
  const allStrategies = [...localExtra, ...strategies];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [tier, setTier] = useState<QuotationTier | "">("");
  const [markup, setMarkup] = useState<number | "">("");
  const [contingency, setContingency] = useState<number | "">("");
  const [overhead, setOverhead] = useState<number | "">("");
  const [profitMargin, setProfitMargin] = useState<number | "">("");
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  const tierValid = tier !== "";
  const markupValid = markup !== "" && isPercent(Number(markup));
  const contingencyValid = contingency !== "" && isPercent(Number(contingency));
  const overheadValid = overhead !== "" && isPercent(Number(overhead));
  const profitValid = profitMargin !== "" && isPercent(Number(profitMargin));
  const formValid = tierValid && markupValid && contingencyValid && overheadValid && profitValid;

  const startAdd = () => {
    setAdding(true);
    setSelectedId(null);
    setTier("");
    setMarkup("");
    setContingency("");
    setOverhead("");
    setProfitMargin("");
    setTouched(false);
    setSavedMessage(false);
    resetSave();
  };

  const handleSave = async () => {
    setTouched(true);
    if (!formValid) return;
    try {
      await save({
        quotation_tier: tier as QuotationTier,
        markup_percentage: Number(markup),
        contingency_percentage: Number(contingency),
        overhead_percentage: Number(overhead),
        profit_margin_percentage: Number(profitMargin),
      });
      const optimistic: PricingStrategyRule = {
        pricing_strategy_id: stagingId("ps"),
        quotation_tier: tier as QuotationTier,
        markup_percentage: Number(markup),
        contingency_percentage: Number(contingency),
        overhead_percentage: Number(overhead),
        profit_margin_percentage: Number(profitMargin),
        status: "Active",
      };
      setLocalExtra((prev) => [optimistic, ...prev]);
      setAdding(false);
      setSelectedId(optimistic.pricing_strategy_id);
      setSavedMessage(true);
    } catch {
      // surfaced via saveError below — no fabricated success
    }
  };

  const selected = allStrategies.find((s) => s.pricing_strategy_id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Pricing Strategy</h2>
        <p className="text-xs text-gray-500">
          Configure markup, contingency, overhead, and profit margin per quotation tier.
        </p>
      </div>

      <RuleListDetailPanel
        title="Pricing Strategies"
        items={allStrategies}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        getId={(s) => s.pricing_strategy_id}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setAdding(false);
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
          adding ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">New Pricing Strategy</p>
                <button type="button" onClick={() => setAdding(false)} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <PercentField label="Markup" value={markup} onChange={setMarkup} touched={touched} />
                <PercentField label="Contingency" value={contingency} onChange={setContingency} touched={touched} />
                <PercentField label="Overhead" value={overhead} onChange={setOverhead} touched={touched} />
                <PercentField label="Profit Margin" value={profitMargin} onChange={setProfitMargin} touched={touched} />
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
                {isSaving ? "Saving…" : "Save Pricing Strategy"}
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
                <p className="text-lg font-bold text-gray-900">{selected.quotation_tier} Tier</p>
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
