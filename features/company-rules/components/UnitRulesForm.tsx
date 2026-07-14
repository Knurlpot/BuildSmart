"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, X } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import { useUnitRules, useCheckRuleUsage, stagingId } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useEditableRuleList } from "@/lib/dev/provisional/useEditableRuleList";
import { isPercent, isPositiveNumber } from "@/lib/dev/provisional/ruleValidation";
import { unitRuleTargetKind, type UnitRule, type UnitRuleTargetKind } from "@/lib/dev/provisional/companyRulesTypes";
import { useItemsCatalog } from "@/hooks/useItemsCatalog";
import { CATEGORY_TYPES, type CategoryType } from "@/types/entities/category";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

interface UnitRulesFormProps {
  focusRuleId?: string | null;
  onFocusHandled?: () => void;
}

export function UnitRulesForm({ focusRuleId, onFocusHandled }: UnitRulesFormProps) {
  const { rules, isLoading, error, refetch, save, isSaving, saveError, resetSave, update, supersede } = useUnitRules();
  const { checkUsage } = useCheckRuleUsage();
  const editable = useEditableRuleList<UnitRule>({ checkUsage, update, supersede, idPrefix: "ur" });
  const { items, isLoading: itemsLoading, itemsInCategory } = useItemsCatalog();
  const allRules = editable.applyOverrides([...editable.localExtra, ...rules]);

  // Part C — seeded from the prop at construction, not synced via effect: a jump always
  // remounts this component fresh (see ScopeTemplatesForm for the full reasoning).
  const [selectedId, setSelectedId] = useState<string | null>(focusRuleId ?? null);
  const [mode, setMode] = useState<"idle" | "add" | "edit">("idle");
  const [targetKind, setTargetKind] = useState<UnitRuleTargetKind>("category");
  const [category, setCategory] = useState<CategoryType | "">("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [conversionFactor, setConversionFactor] = useState<number | "">("");
  const [wastage, setWastage] = useState<number | "">("");
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    if (focusRuleId) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryOptions = CATEGORY_TYPES;
  const categoryValid = category !== "";
  const itemValid = targetKind === "category" || itemCode !== "";
  const factorValid = conversionFactor !== "" && isPositiveNumber(Number(conversionFactor));
  const wastageValid = wastage !== "" && isPercent(Number(wastage));
  const formValid = categoryValid && itemValid && factorValid && wastageValid;

  const categoryItems = category !== "" ? itemsInCategory(category) : [];

  const resetForm = () => {
    setTargetKind("category");
    setCategory("");
    setItemSearch("");
    setItemCode("");
    setConversionFactor("");
    setWastage("");
    setTouched(false);
  };

  const startAdd = () => {
    setMode("add");
    setSelectedId(null);
    resetForm();
    setSavedMessage(false);
    resetSave();
  };

  const startEdit = (r: UnitRule) => {
    setMode("edit");
    setTargetKind(unitRuleTargetKind(r));
    setCategory(r.category ?? "");
    setItemCode(r.item_code ?? "");
    setItemSearch(r.item_name ?? "");
    setConversionFactor(r.conversion_factor);
    setWastage(r.wastage_allowance_percentage);
    setTouched(false);
    setSavedMessage(false);
  };

  const buildPayload = () => ({
    category: targetKind === "category" ? (category as CategoryType) : null,
    item_code: targetKind === "item" ? itemCode : null,
    item_name: targetKind === "item" ? itemSearch : null,
    conversion_factor: Number(conversionFactor),
    wastage_allowance_percentage: Number(wastage),
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
      const optimistic: UnitRule = {
        rule_id: stagingId("ur"),
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Unit Rules</h2>
        <p className="text-xs text-gray-500">
          Define unit conversion factors and wastage allowances — per material category, or
          for one specific catalog item.
        </p>
      </div>

      <RuleListDetailPanel
        title="Unit Rules"
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
        emptyHint="Add a unit rule to define a conversion factor and wastage allowance."
        renderListItem={(r) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-800">{r.item_name ?? r.category}</span>
            <span className="text-xs text-gray-400">{r.item_name ? `Item override — ${r.category ?? ""}` : "Category default"}</span>
            <span className="text-[10px] text-gray-400">{r.wastage_allowance_percentage}% wastage</span>
          </div>
        )}
        detail={
          mode === "add" || mode === "edit" ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">{mode === "edit" ? "Edit Unit Rule" : "New Unit Rule"}</p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {mode === "edit" && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    If this rule is used by existing quotations, saving will create a new
                    version — existing quotations keep their original values.
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">Applies To</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetKind("category")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      targetKind === "category"
                        ? "border-primary bg-orange-50 text-primary"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    A whole category
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetKind("item")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      targetKind === "item"
                        ? "border-primary bg-orange-50 text-primary"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    One specific item
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">
                  An item-level rule overrides its category&apos;s rule. Example: a 10% wastage
                  rule on all Finishing materials, with one high-end finish set to 5% — that
                  item uses 5%, everything else in the category still uses 10%.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {targetKind === "category" ? "Material Category" : "Item's Category"} <span className="text-red-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value as CategoryType);
                    setItemCode("");
                    setItemSearch("");
                  }}
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  {categoryOptions.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                {touched && !categoryValid && <p className="text-xs text-red-500">Select a category.</p>}
              </div>

              {targetKind === "item" && category !== "" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-600">
                    Item <span className="text-red-500">*</span>
                  </label>
                  {itemsLoading ? (
                    <p className="text-xs text-gray-400">Loading catalog…</p>
                  ) : items.length === 0 ? (
                    <p className="text-xs text-amber-600">No items in your catalog yet — upload a pricelist first.</p>
                  ) : (
                    <>
                      <input
                        list="unit-rule-items"
                        value={itemSearch}
                        onChange={(e) => {
                          const typed = e.target.value;
                          setItemSearch(typed);
                          const match = categoryItems.find((i) => i.item_name === typed);
                          setItemCode(match ? String(match.item_code) : "");
                        }}
                        placeholder="Search or select an item…"
                        className={inputCls}
                      />
                      <datalist id="unit-rule-items">
                        {categoryItems.map((i) => (
                          <option key={i.item_code} value={i.item_name} />
                        ))}
                      </datalist>
                    </>
                  )}
                  {touched && !itemValid && <p className="text-xs text-red-500">Select an item.</p>}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Conversion Factor <span className="text-red-500">*</span>
                </label>
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
                {isSaving || editable.isSaving ? "Saving…" : mode === "edit" ? "Save Changes" : "Save Unit Rule"}
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
                  <p className="text-lg font-bold text-gray-900">{selected.item_name ?? selected.category}</p>
                  <p className="text-sm text-gray-500">
                    {selected.item_name ? `Item-level override (${selected.category ?? "—"})` : "Category-level default"}
                  </p>
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
