"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import { useUnitRules, stagingId } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { isNonEmpty, isPercent, isPositiveNumber } from "@/lib/dev/provisional/ruleValidation";
import type { UnitRule } from "@/lib/dev/provisional/companyRulesTypes";
import { CATEGORY_TYPES, type CategoryType } from "@/types/entities/category";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

export function UnitRulesForm() {
  const { rules, isLoading, error, refetch, save, isSaving, saveError, resetSave } = useUnitRules();
  const [localExtra, setLocalExtra] = useState<UnitRule[]>([]);
  const allRules = [...localExtra, ...rules];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<CategoryType | "">("");
  const [conversionLabel, setConversionLabel] = useState("");
  const [conversionFactor, setConversionFactor] = useState<number | "">("");
  const [wastage, setWastage] = useState<number | "">("");
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  const categoryValid = category !== "";
  const labelValid = isNonEmpty(conversionLabel);
  const factorValid = conversionFactor !== "" && isPositiveNumber(Number(conversionFactor));
  const wastageValid = wastage !== "" && isPercent(Number(wastage));
  const formValid = categoryValid && labelValid && factorValid && wastageValid;

  const startAdd = () => {
    setAdding(true);
    setSelectedId(null);
    setCategory("");
    setConversionLabel("");
    setConversionFactor("");
    setWastage("");
    setTouched(false);
    setSavedMessage(false);
    resetSave();
  };

  const handleSave = async () => {
    setTouched(true);
    if (!formValid) return;
    try {
      await save({
        category: category as CategoryType,
        conversion_label: conversionLabel,
        conversion_factor: Number(conversionFactor),
        wastage_allowance_percentage: Number(wastage),
      });
      const optimistic: UnitRule = {
        unit_rule_id: stagingId("ur"),
        category: category as CategoryType,
        conversion_label: conversionLabel,
        conversion_factor: Number(conversionFactor),
        wastage_allowance_percentage: Number(wastage),
        status: "Active",
      };
      setLocalExtra((prev) => [optimistic, ...prev]);
      setAdding(false);
      setSelectedId(optimistic.unit_rule_id);
      setSavedMessage(true);
    } catch {
      // surfaced via saveError below — no fabricated success
    }
  };

  const selected = allRules.find((r) => r.unit_rule_id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Unit Rules</h2>
        <p className="text-xs text-gray-500">
          Define unit conversion factors and wastage allowances per material category.
        </p>
      </div>

      <RuleListDetailPanel
        title="Unit Rules"
        items={allRules}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        getId={(r) => r.unit_rule_id}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setAdding(false);
        }}
        onAdd={startAdd}
        emptyHint="Add a unit rule to define a conversion factor and wastage allowance."
        renderListItem={(r) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-800">{r.category}</span>
            <span className="text-xs text-gray-400">{r.conversion_label}</span>
            <span className="text-[10px] text-gray-400">{r.wastage_allowance_percentage}% wastage</span>
          </div>
        )}
        detail={
          adding ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">New Unit Rule</p>
                <button type="button" onClick={() => setAdding(false)} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Material Category <span className="text-red-500">*</span>
                </label>
                <select value={category} onChange={(e) => setCategory(e.target.value as CategoryType)} className={inputCls}>
                  <option value="">Select…</option>
                  {CATEGORY_TYPES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                {touched && !categoryValid && <p className="text-xs text-red-500">Select a category.</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Conversion Factor <span className="text-red-500">*</span>
                </label>
                <input
                  value={conversionLabel}
                  onChange={(e) => setConversionLabel(e.target.value)}
                  placeholder="e.g. bag -> kg"
                  className={inputCls}
                />
                {touched && !labelValid && <p className="text-xs text-red-500">Describe what this factor converts.</p>}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={conversionFactor}
                  onChange={(e) => setConversionFactor(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Factor value"
                  className={inputCls}
                />
                {touched && !factorValid && <p className="text-xs text-red-500">Must be greater than 0.</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Wastage Allowance <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={wastage}
                    onChange={(e) => setWastage(e.target.value === "" ? "" : Number(e.target.value))}
                    className={`${inputCls} pr-8`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                </div>
                {touched && !wastageValid && <p className="text-xs text-red-500">Enter a value between 0 and 100.</p>}
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
                {isSaving ? "Saving…" : "Save Unit Rule"}
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
                <p className="text-lg font-bold text-gray-900">{selected.category}</p>
                <p className="text-sm text-gray-500">{selected.conversion_label}</p>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Conversion Factor</dt>
                  <dd className="text-gray-700">{selected.conversion_factor}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Wastage Allowance</dt>
                  <dd className="text-gray-700">{selected.wastage_allowance_percentage}%</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-400">
              <p className="text-sm">Select a unit rule to view it, or add a new one.</p>
            </div>
          )
        }
      />
    </div>
  );
}
