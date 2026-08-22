"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Pencil, Search, X } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import { useMaterialRules, useCheckRuleUsage, stagingId } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useEditableRuleList } from "@/lib/dev/provisional/useEditableRuleList";
import type { MaterialRuleEntry } from "@/lib/dev/provisional/companyRulesTypes";
import { useItemsCatalog } from "@/hooks/useItemsCatalog";
import { useCategories } from "@/hooks/useCategories";
import { usePricelistCatalog } from "@/hooks/usePricelistCatalog";
import { TREATMENT_TYPES } from "@/lib/dev/provisional/quotationGenerationTypes";
import { CATEGORY_TYPES, type CategoryType } from "@/types/entities/category";
import type { Items } from "@/types/entities/items";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

const DEFAULT_MATERIAL_PRIORITY = 1;
const DEFAULT_PRIORITY_SOURCE = "Supplier" as const;
const DEFAULT_FALLBACK_RULE = "Flag for manual review" as const;
const TREATMENT_OPTIONS = [...TREATMENT_TYPES];

interface MaterialRulesFormProps {
  focusRuleId?: string | null;
  onFocusHandled?: () => void;
}

//
export function MaterialRulesForm({ focusRuleId, onFocusHandled }: MaterialRulesFormProps) {
  const {
    rules,
    isLoading,
    error,
    refetch,
    save,
    update,
    supersede,
    isSaving: isCreating,
    saveError: createError,
    resetSave: resetCreate,
  } = useMaterialRules();
  const { checkUsage } = useCheckRuleUsage();
  const editable = useEditableRuleList<MaterialRuleEntry>({ checkUsage, update, supersede, idPrefix: "mr" });
  const { items, isLoading: itemsLoading, error: itemsError } = useItemsCatalog();
  const { categories, isLoading: categoriesLoading, error: categoriesError } = useCategories();
  const { records: supplierPriceRecords, isLoading: supplierPricesLoading, load: loadSupplierPrices } = usePricelistCatalog();

  const allRules = editable.applyOverrides([...editable.localExtra, ...rules]);

  const categoryTypeOf = (item: Items): CategoryType | undefined =>
    categories.find((c) => c.category_id === item.category_id)?.category_type;

  // Seeded from the prop at construction, not synced via effect: a jump always remounts
  // this component fresh through CompanyRulesShell.
  const [selectedId, setSelectedId] = useState<string | null>(focusRuleId ?? null);
  const [mode, setMode] = useState<"idle" | "browse" | "configure" | "edit-group">("idle");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryType | "">("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [checkedItemCodes, setCheckedItemCodes] = useState<Set<string>>(new Set());
  const [treatmentType, setTreatmentType] = useState("");
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"active" | "disabled">("active");
  const [isDisablingGroup, setIsDisablingGroup] = useState(false);

  useEffect(() => {
    if (focusRuleId) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSupplierPrices();
  }, [loadSupplierPrices]);

  const supplierOptions = Array.from(
    new Set(supplierPriceRecords.map((record) => record.supplier_name?.trim()).filter((value): value is string => !!value))
  ).sort((a, b) => a.localeCompare(b));

  const filteredItems = items.filter((item) => {
    const matchesSearch = search.trim() === "" || item.item_name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesCategory = categoryFilter === "" || categoryTypeOf(item) === categoryFilter;
    const matchesSupplier =
      supplierFilter === "" ||
      supplierPriceRecords.some(
        (record) => String(record.item_code) === String(item.item_code) && record.supplier_name === supplierFilter
      );
    return matchesSearch && matchesCategory && matchesSupplier;
  });

  const itemMeta = (item: Items) =>
    [
      item.description?.trim(),
      categoryTypeOf(item) ?? "Uncategorized",
      item.brand,
      item.unit,
    ].filter(Boolean).join(" · ");

  const checkedItems = items.filter((i) => checkedItemCodes.has(String(i.item_code)));

  const toggleChecked = (itemCode: string) => {
    setCheckedItemCodes((prev) => {
      const next = new Set(prev);
      if (next.has(itemCode)) next.delete(itemCode);
      else next.add(itemCode);
      return next;
    });
  };

  const startAdd = () => {
    resetCreate();
    setStatusFilter("active");
    setMode("browse");
    setSelectedId(null);
    setSearch("");
    setCategoryFilter("");
    setSupplierFilter("");
    setCheckedItemCodes(new Set());
    setTreatmentType("");
    setTouched(false);
    setSavedMessage(false);
  };

  const goToConfigure = () => {
    setTouched(false);
    setMode("configure");
  };

  const startEditGroup = (group: { id: string; treatmentType: string; materials: MaterialRuleEntry[] }) => {
    resetCreate();
    setMode("edit-group");
    setSelectedId(group.id);
    setTreatmentType(group.treatmentType);
    setCheckedItemCodes(new Set(group.materials.map((rule) => String(rule.preferred_item_code))));
    setSearch("");
    setCategoryFilter("");
    setSupplierFilter("");
    setTouched(false);
    setSavedMessage(false);
  };

  const allConfigValid =
    checkedItems.length > 0 &&
    TREATMENT_OPTIONS.includes(treatmentType as (typeof TREATMENT_OPTIONS)[number]) &&
    checkedItems.every((i) => categoryTypeOf(i) !== undefined);

  const handleSaveAll = async () => {
    setTouched(true);
    if (!allConfigValid) return;
    try {
      for (const item of checkedItems) {
        const code = String(item.item_code);
        const category = categoryTypeOf(item);
        if (!category) throw new Error(`Could not resolve the category for ${item.item_name}.`);
        const payload = {
          treatment_type: treatmentType.trim() || null,
          category,
          preferred_item_code: code,
          preferred_item_name: item.item_name,
          material_priority: DEFAULT_MATERIAL_PRIORITY,
          priority_source: DEFAULT_PRIORITY_SOURCE,
          fallback_rule: DEFAULT_FALLBACK_RULE,
        };
        await save(payload);
        editable.addCreated({
          rule_id: stagingId("mr"),
          ...payload,
          is_active: true,
          effective_date: new Date().toISOString().slice(0, 10),
        });
      }
      setStatusFilter("active");
      setMode("idle");
      setSelectedId(treatmentType.trim());
      setSavedMessage(true);
    } catch {
      // surfaced via editable.saveError below — no fabricated success
    }
  };

  const disableMaterialRule = async (ruleId: string) => {
    const response = await fetch(`/api/company-rules/material-rules/${ruleId}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "Could not disable material rule.");
  };

  const handleSaveGroupEdit = async () => {
    setTouched(true);
    if (!selectedGroup || !allConfigValid) return;

    const existingByCode = new Map(selectedGroup.materials.map((rule) => [String(rule.preferred_item_code), rule]));
    const checkedCodes = new Set(checkedItems.map((item) => String(item.item_code)));
    try {
      for (const item of checkedItems) {
        const code = String(item.item_code);
        if (existingByCode.has(code)) continue;
        const category = categoryTypeOf(item);
        if (!category) throw new Error(`Could not resolve the category for ${item.item_name}.`);
        await save({
          treatment_type: treatmentType.trim() || null,
          category,
          preferred_item_code: code,
          preferred_item_name: item.item_name,
          material_priority: DEFAULT_MATERIAL_PRIORITY,
          priority_source: DEFAULT_PRIORITY_SOURCE,
          fallback_rule: DEFAULT_FALLBACK_RULE,
        });
      }
      for (const rule of selectedGroup.materials) {
        if (!checkedCodes.has(String(rule.preferred_item_code))) {
          await disableMaterialRule(rule.rule_id);
        }
      }
      window.dispatchEvent(new CustomEvent("buildsmart:company-rules-changed", { detail: { kind: "material-rules" } }));
      refetch();
      setStatusFilter("active");
      setMode("idle");
      setSelectedId(treatmentType.trim());
      setSavedMessage(true);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDisableGroup = async (group: { id: string; materials: MaterialRuleEntry[] }) => {
    setIsDisablingGroup(true);
    try {
      for (const rule of group.materials.filter((item) => item.is_active)) {
        await disableMaterialRule(rule.rule_id);
      }
      window.dispatchEvent(new CustomEvent("buildsmart:company-rules-changed", { detail: { kind: "material-rules" } }));
      refetch();
      setSelectedId(null);
      setMode("idle");
    } catch (error) {
      console.error(error);
    } finally {
      setIsDisablingGroup(false);
    }
  };

  const groupedRules = useMemo(
    () =>
      Array.from(
        allRules.reduce((groups, rule) => {
          const treatment = rule.treatment_type?.trim() || "No treatment type";
          groups.set(treatment, [...(groups.get(treatment) ?? []), rule]);
          return groups;
        }, new Map<string, MaterialRuleEntry[]>())
      )
        .map(([treatmentType, materials]) => ({
          id: treatmentType,
          treatmentType,
          materials: materials.sort((a, b) => a.preferred_item_name.localeCompare(b.preferred_item_name)),
        }))
        .sort((a, b) => a.treatmentType.localeCompare(b.treatmentType)),
    [allRules]
  );
  const selectedGroup = groupedRules.find((group) => group.id === selectedId) ?? null;
  const visibleGroups = groupedRules.filter((group) => {
    const isActive = group.materials.some((rule) => rule.is_active);
    return isActive === (statusFilter === "active");
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Material Rules</h2>
        <p className="text-xs text-gray-500">
          Link materials from your catalog to each treatment type.
        </p>
      </div>

      <RuleListDetailPanel
        title="Material Rules"
        items={visibleGroups}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        getId={(group) => group.id}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setMode("idle");
        }}
        onAdd={startAdd}
        emptyHint="Add materials from your catalog and tag them with a treatment type."
        countLabel={`${groupedRules.length} treatment group${groupedRules.length === 1 ? "" : "s"}`}
        contentClassName="grid items-start gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(34rem,1.2fr)]"
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
                  statusFilter === filter
                    ? "border-primary bg-orange-50 text-primary"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        }
        renderListItem={(group) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-800">{group.treatmentType}</span>
            <span className="text-xs text-gray-400">
              {group.materials.length} material{group.materials.length === 1 ? "" : "s"}
            </span>
            <span className="text-[10px] font-semibold text-primary">
              {Array.from(new Set(group.materials.map((rule) => rule.category))).join(", ")}
            </span>
          </div>
        )}
        detail={
          mode === "browse" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">Add Materials</p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(12rem,1fr)_minmax(9rem,11rem)_minmax(10rem,12rem)]">
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search the catalog…"
                    className={`${inputCls} pl-9`}
                  />
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as CategoryType | "")}
                  className={inputCls}
                >
                  <option value="">All categories</option>
                  {CATEGORY_TYPES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className={`${inputCls} min-w-0`}
                >
                  <option value="">All suppliers</option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier} value={supplier}>
                      {supplier}
                    </option>
                  ))}
                </select>
              </div>
              {supplierPricesLoading && <p className="text-[11px] text-gray-400">Loading supplier filters...</p>}

              {itemsLoading ? (
                <p className="text-xs text-gray-400">Loading catalog…</p>
              ) : itemsError ? (
                <p className="text-xs text-red-500">Couldn&apos;t load your catalog: {itemsError.message}</p>
              ) : items.length === 0 ? (
                <p className="text-xs text-amber-600">No items in your catalog. Upload a pricelist first.</p>
              ) : filteredItems.length === 0 ? (
                <p className="text-xs text-gray-400">No catalog items match that search.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
                  {filteredItems.map((item) => {
                    const code = String(item.item_code);
                    return (
                      <label
                        key={code}
                        className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 last:border-b-0 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={checkedItemCodes.has(code)}
                          onChange={() => toggleChecked(code)}
                          className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{item.item_name}</p>
                          <p className="truncate text-[11px] text-gray-400">{itemMeta(item)}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                disabled={checkedItems.length === 0 || categoriesLoading || !!categoriesError}
                onClick={goToConfigure}
                className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
              >
                {categoriesLoading
                  ? "Loading categories..."
                  : `Continue with ${checkedItems.length} selected`}
              </button>
              {categoriesError && (
                <p className="text-xs text-red-500">Couldn&apos;t load material categories: {categoriesError.message}</p>
              )}
            </div>
          ) : mode === "configure" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">Set Treatment Type</p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="material-treatment-type" className="text-xs font-semibold text-gray-600">
                  Treatment Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="material-treatment-type"
                  value={treatmentType}
                  onChange={(e) => setTreatmentType(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select treatment type...</option>
                  {TREATMENT_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400">
                  Quick quotation uses this to match a segment&apos;s treatment to these materials.
                </p>
                {touched && !TREATMENT_OPTIONS.includes(treatmentType as (typeof TREATMENT_OPTIONS)[number]) && (
                  <p className="text-xs text-red-500">Choose one of BuildSmart&apos;s treatment types.</p>
                )}
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Selected Materials</p>
                <div className="mt-2 max-h-52 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100 bg-white [scrollbar-width:thin]">
                  {checkedItems.map((item) => (
                    <div key={item.item_code} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-800">{item.item_name}</p>
                        <p className="truncate text-[11px] text-gray-400">{itemMeta(item)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                        {categoryTypeOf(item) ?? "Uncategorized"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {createError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t save: {createError.message}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode("browse")}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={isCreating}
                  className="flex flex-2 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
                >
                  {isCreating ? "Saving…" : `Save ${checkedItems.length} Material Rule${checkedItems.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          ) : mode === "edit-group" && selectedGroup ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">Edit Treatment Materials</p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Treatment</p>
                <p className="text-sm font-semibold text-gray-800">{selectedGroup.treatmentType}</p>
              </div>

              <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(12rem,1fr)_minmax(9rem,11rem)_minmax(10rem,12rem)]">
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search the catalog..."
                    className={`${inputCls} pl-9`}
                  />
                </div>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as CategoryType | "")} className={inputCls}>
                  <option value="">All categories</option>
                  {CATEGORY_TYPES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className={`${inputCls} min-w-0`}>
                  <option value="">All suppliers</option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier} value={supplier}>
                      {supplier}
                    </option>
                  ))}
                </select>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 [scrollbar-width:thin]">
                {filteredItems.map((item) => {
                  const code = String(item.item_code);
                  return (
                    <label key={code} className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 last:border-b-0 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checkedItemCodes.has(code)}
                        onChange={() => toggleChecked(code)}
                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">{item.item_name}</p>
                        <p className="truncate text-[11px] text-gray-400">{itemMeta(item)}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              {touched && checkedItems.length === 0 && <p className="text-xs text-red-500">Select at least one material.</p>}

              <button
                type="button"
                onClick={handleSaveGroupEdit}
                disabled={isCreating}
                className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
              >
                {isCreating ? "Saving..." : "Save Treatment Materials"}
              </button>
            </div>
          ) : selectedGroup ? (
            <div className="flex flex-col gap-4">
              {savedMessage && editable.supersededNotice && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  A new version of this rule was created. The previous version is preserved for existing quotations.
                </div>
              )}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <div>
                  <p className="text-lg font-bold text-gray-900">{selectedGroup.treatmentType}</p>
                  <p className="text-sm text-gray-500">
                    {selectedGroup.materials.length} selected material{selectedGroup.materials.length === 1 ? "" : "s"} for this treatment.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => startEditGroup(selectedGroup)}
                    title="Edit treatment materials"
                    aria-label={`Edit ${selectedGroup.treatmentType} materials`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary/40 hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisableGroup(selectedGroup)}
                    disabled={isDisablingGroup}
                    title="Disable treatment"
                    aria-label={`Disable ${selectedGroup.treatmentType}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Materials Under This Treatment</p>
                </div>
                <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto [scrollbar-width:thin]">
                  {selectedGroup.materials.map((rule) => (
                    <div key={rule.rule_id} className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{rule.preferred_item_name}</p>
                        <p className="text-xs text-gray-500">{rule.category}</p>
                        <p className="mt-1 text-[11px] text-gray-400">Effective {rule.effective_date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[26rem] w-full flex-col items-center justify-center gap-2 px-6 text-center text-gray-400">
              <p className="text-sm">Select Material Rule</p>
            </div>
          )
        }
      />
    </div>
  );
}
