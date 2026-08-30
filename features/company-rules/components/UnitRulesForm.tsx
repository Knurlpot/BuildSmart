"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, X, XCircle } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import { useUnitRules, useCheckRuleUsage, stagingId } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useEditableRuleList } from "@/lib/dev/provisional/useEditableRuleList";
import { isPercent, isPositiveNumber } from "@/lib/dev/provisional/ruleValidation";
import { apiClient } from "@/lib/api/client";
import { unitRuleTargetKind, type UnitRule, type UnitRuleTargetKind } from "@/lib/dev/provisional/companyRulesTypes";
import { useItemsCatalog } from "@/hooks/useItemsCatalog";
import { CATEGORY_TYPES, type CategoryType } from "@/types/entities/category";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

interface UnitRulesFormProps {
  focusRuleId?: string | null;
  onFocusHandled?: () => void;
}

function unitRuleScopeLabel(rule: UnitRule): string {
  return unitRuleTargetKind(rule) === "item" ? "Specific Item" : "Per Category";
}

function unitRuleDisplayName(rule: UnitRule): string {
  return unitRuleTargetKind(rule) === "item"
    ? (rule.item_name ?? "Specific Item")
    : (rule.category ?? "Category not set");
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
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [conversionFactor, setConversionFactor] = useState<number | "">("");
  const [wastage, setWastage] = useState<number | "">("");
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"active" | "disabled">("active");
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableError, setDisableError] = useState<Error | null>(null);

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
  const itemQuery = itemSearch.trim().toLowerCase();
  const relatedItems = (itemQuery
    ? categoryItems.filter((item) =>
        [item.item_name, item.brand, item.unit, item.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(itemQuery)
      )
    : categoryItems
  ).slice(0, 8);

  const resetForm = () => {
    setTargetKind("category");
    setCategory("");
    setItemSearch("");
    setItemCode("");
    setItemPickerOpen(false);
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
        setStatusFilter("active");
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
      setStatusFilter("active");
      setMode("idle");
      setSelectedId(optimistic.rule_id);
      setSavedMessage(true);
    } catch {
      // surfaced via saveError below — no fabricated success
    }
  };

  const handleDisable = async () => {
    if (!selected || isDisabling) return;
    setIsDisabling(true);
    setDisableError(null);
    try {
      await apiClient(`/api/company-rules/unit-rules/${selected.rule_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setMode("idle");
      setSelectedId(null);
      setStatusFilter("disabled");
      await refetch();
      window.dispatchEvent(new CustomEvent("buildsmart:company-rules-changed", { detail: { kind: "unit-rules" } }));
    } catch (error) {
      setDisableError(error instanceof Error ? error : new Error("Could not disable this unit rule."));
    } finally {
      setIsDisabling(false);
    }
  };

  const selected = allRules.find((r) => r.rule_id === selectedId) ?? null;
  const effectiveStatusFilter = selected?.is_active === false ? "disabled" : statusFilter;
  const visibleRules = allRules.filter((rule) => rule.is_active === (effectiveStatusFilter === "active"));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Unit Rules</h2>
        <p className="text-xs text-gray-500">
          Set unit conversions and wastage allowances.
        </p>
      </div>

      <RuleListDetailPanel
        title="Unit Rules"
        items={visibleRules}
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
        countLabel={`${allRules.length} configured`}
        listHeader={
          <div className="grid grid-cols-2 gap-2">
            {(["active", "disabled"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => {
                  setStatusFilter(filter);
                  setMode("idle");
                  setSelectedId(null);
                }}
                className={`min-h-9 rounded-lg border px-3 py-2 text-center text-xs font-semibold capitalize transition ${
                  effectiveStatusFilter === filter
                    ? "border-primary bg-orange-50 text-primary"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        }
        renderListItem={(r) => (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-gray-800">{unitRuleDisplayName(r)}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  r.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
                }`}
              >
                {r.is_active ? "Active" : "Disabled"}
              </span>
            </div>
            <span className="text-xs text-gray-400">{unitRuleScopeLabel(r)}</span>
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
                    Per Category
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
                    Specific Item
                  </button>
                </div>
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
                    setItemPickerOpen(false);
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
                  {itemsLoading ? (
                    <p className="text-xs text-gray-400">Loading catalog…</p>
                  ) : items.length === 0 ? (
                    <p className="text-xs text-amber-600">No items in your catalog. Upload a pricelist first.</p>
                  ) : (
                    <div className="relative">
                      <input
                        value={itemSearch}
                        onFocus={() => setItemPickerOpen(true)}
                        onBlur={() => window.setTimeout(() => setItemPickerOpen(false), 120)}
                        onChange={(e) => {
                          const typed = e.target.value;
                          setItemSearch(typed);
                          const match = categoryItems.find((i) => i.item_name === typed);
                          setItemCode(match ? String(match.item_code) : "");
                          setItemPickerOpen(true);
                        }}
                        placeholder=" "
                        className="peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                      />
                      <label
                        className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
                      >
                        Item <span className="text-red-500">*</span>
                      </label>
                      {itemPickerOpen && (
                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                          {relatedItems.length > 0 ? (
                            relatedItems.map((item) => (
                              <button
                                key={item.item_code}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setItemSearch(item.item_name);
                                  setItemCode(String(item.item_code));
                                  setItemPickerOpen(false);
                                }}
                                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-orange-50"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-medium text-gray-800">{item.item_name}</span>
                                  <span className="block truncate text-xs text-gray-400">
                                    {[item.brand, item.unit, item.item_source].filter(Boolean).join(" · ")}
                                  </span>
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-2 text-xs text-gray-400">No related items in this category.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {touched && !itemValid && <p className="text-xs text-red-500">Select an item.</p>}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="unit-wastage-allowance"
                      type="text"
                      inputMode="decimal"
                      value={wastage}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d.]/g, "");
                        setWastage(next === "" ? "" : Number(next));
                      }}
                      placeholder=" "
                      className="peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pr-8 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                    />
                    <label
                      htmlFor="unit-wastage-allowance"
                      className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
                    >
                      Wastage Allowance <span className="text-red-500">*</span>
                    </label>
                    <span className="pointer-events-none absolute right-3 top-[1.9rem] -translate-y-1/2 text-xs text-gray-400">%</span>
                  </div>
                  {touched && !wastageValid && <p className="text-xs text-red-500">Enter a value between 0 and 100.</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="unit-conversion-factor"
                      type="text"
                      inputMode="decimal"
                      value={conversionFactor}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d.]/g, "");
                        setConversionFactor(next === "" ? "" : Number(next));
                      }}
                      placeholder=" "
                      className="peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                    />
                    <label
                      htmlFor="unit-conversion-factor"
                      className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
                    >
                      Conversion Factor <span className="text-red-500">*</span>
                    </label>
                  </div>
                  {touched && !factorValid && <p className="text-xs text-red-500">Must be greater than 0.</p>}
                </div>
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
              {savedMessage && editable.supersededNotice && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  A new version of this rule was created. The previous version is preserved for existing quotations.
                </div>
              )}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <div>
                  <p className="text-lg font-bold text-gray-900">{unitRuleDisplayName(selected)}</p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      selected.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {selected.is_active ? "Active" : "Disabled"}
                  </span>
                  <p className="text-sm text-gray-500">
                    {unitRuleScopeLabel(selected)}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400">Effective {selected.effective_date}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(selected)}
                    title="Edit"
                    aria-label="Edit unit rule"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-primary hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={isDisabling || !selected.is_active}
                    onClick={handleDisable}
                    title="Disable"
                    aria-label="Disable unit rule"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {disableError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  Couldn&apos;t disable: {disableError.message}
                </div>
              )}
              <dl className="grid grid-cols-2 gap-4 px-4 text-sm">
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
            <div className="flex min-h-[26rem] w-full flex-col items-center justify-center gap-2 text-center text-gray-400">
              <p className="text-sm">Select Unit Rule</p>
            </div>
          )
        }
      />
    </div>
  );
}
