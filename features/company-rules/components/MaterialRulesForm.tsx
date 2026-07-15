"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Search, X } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import { useMaterialRules, useCheckRuleUsage, stagingId } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useEditableRuleList } from "@/lib/dev/provisional/useEditableRuleList";
import { isPositiveNumber } from "@/lib/dev/provisional/ruleValidation";
import {
  MATERIAL_FALLBACK_RULES,
  type MaterialFallbackRule,
  type MaterialRuleEntry,
} from "@/lib/dev/provisional/companyRulesTypes";
import { useItemsCatalog } from "@/hooks/useItemsCatalog";
import { useCategories } from "@/hooks/useCategories";
import { CATEGORY_TYPES, type CategoryType } from "@/types/entities/category";
import type { Items } from "@/types/entities/items";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

interface ItemConfig {
  priority: number | "";
  fallback: MaterialFallbackRule | "";
}

interface MaterialRulesFormProps {
  focusRuleId?: string | null;
  onFocusHandled?: () => void;
}

// v6 Correction 3 — REBUILT as a catalog picker. A category contains many materials used
// TOGETHER (a waterproofing system needs primer AND membrane AND topcoat), not
// alternatives chosen one-per-category from a dropdown — so this is now a flat,
// standalone list of "preferred item + fallback" records, added by searching/checking
// items straight from the catalog. Category is filtering metadata on the picker, not the
// organizing structure of the list itself (see RuleListDetailPanel below, same
// select+detail pattern every other rule type already uses).
export function MaterialRulesForm({ focusRuleId, onFocusHandled }: MaterialRulesFormProps) {
  const { rules, isLoading, error, refetch, save, update, supersede } = useMaterialRules();
  const { checkUsage } = useCheckRuleUsage();
  const editable = useEditableRuleList<MaterialRuleEntry>({ checkUsage, update, supersede, idPrefix: "mr" });
  const { items, isLoading: itemsLoading, error: itemsError } = useItemsCatalog();
  const { categories } = useCategories();

  const allRules = editable.applyOverrides([...editable.localExtra, ...rules]);

  const categoryTypeOf = (item: Items): CategoryType | undefined =>
    categories.find((c) => c.category_id === item.category_id)?.category_type;

  // seeded from the prop at construction, not synced via effect: a jump always remounts
  // this component fresh (see ScopeTemplatesForm for the full reasoning).
  const [selectedId, setSelectedId] = useState<string | null>(focusRuleId ?? null);
  const [mode, setMode] = useState<"idle" | "browse" | "configure" | "edit">("idle");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryType | "">("");
  const [checkedItemCodes, setCheckedItemCodes] = useState<Set<string>>(new Set());
  const [perItemConfig, setPerItemConfig] = useState<Record<string, ItemConfig>>({});
  const [editPriority, setEditPriority] = useState<number | "">("");
  const [editFallback, setEditFallback] = useState<MaterialFallbackRule | "">("");
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    if (focusRuleId) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredItems = items.filter((item) => {
    const matchesSearch = search.trim() === "" || item.item_name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesCategory = categoryFilter === "" || categoryTypeOf(item) === categoryFilter;
    return matchesSearch && matchesCategory;
  });

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
    setMode("browse");
    setSelectedId(null);
    setSearch("");
    setCategoryFilter("");
    setCheckedItemCodes(new Set());
    setPerItemConfig({});
    setTouched(false);
    setSavedMessage(false);
  };

  const goToConfigure = () => {
    setPerItemConfig((prev) => {
      const next = { ...prev };
      for (const item of checkedItems) {
        const code = String(item.item_code);
        if (!next[code]) next[code] = { priority: 1, fallback: "" };
      }
      return next;
    });
    setTouched(false);
    setMode("configure");
  };

  const startEdit = (r: MaterialRuleEntry) => {
    setMode("edit");
    setEditPriority(r.material_priority);
    setEditFallback(r.fallback_rule);
    setTouched(false);
    setSavedMessage(false);
  };

  const configValid = (code: string) => {
    const cfg = perItemConfig[code];
    return !!cfg && cfg.priority !== "" && isPositiveNumber(Number(cfg.priority)) && cfg.fallback !== "";
  };
  const allConfigValid = checkedItems.length > 0 && checkedItems.every((i) => configValid(String(i.item_code)));

  const handleSaveAll = async () => {
    setTouched(true);
    if (!allConfigValid) return;
    try {
      for (const item of checkedItems) {
        const code = String(item.item_code);
        const category = categoryTypeOf(item);
        if (!category) continue; // shouldn't happen — every catalog item has a resolvable category
        const cfg = perItemConfig[code];
        const payload = {
          category,
          preferred_item_code: code,
          preferred_item_name: item.item_name,
          material_priority: Number(cfg.priority),
          fallback_rule: cfg.fallback as MaterialFallbackRule,
        };
        await save(payload);
        editable.addCreated({
          rule_id: stagingId("mr"),
          ...payload,
          is_active: true,
          effective_date: new Date().toISOString().slice(0, 10),
        });
      }
      setMode("idle");
      setSavedMessage(true);
    } catch {
      // surfaced via editable.saveError below — no fabricated success
    }
  };

  const editValid = editPriority !== "" && isPositiveNumber(Number(editPriority)) && editFallback !== "";

  const handleSaveEdit = async () => {
    setTouched(true);
    if (!editValid || !selectedId) return;
    const current = allRules.find((r) => r.rule_id === selectedId);
    if (!current) return;
    const payload = {
      category: current.category,
      preferred_item_code: current.preferred_item_code,
      preferred_item_name: current.preferred_item_name,
      material_priority: Number(editPriority),
      fallback_rule: editFallback as MaterialFallbackRule,
    };
    const resultId = await editable.saveEdit(selectedId, payload);
    if (resultId) {
      setMode("idle");
      setSelectedId(resultId);
      setSavedMessage(true);
    }
  };

  const selected = allRules.find((r) => r.rule_id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Material Rules</h2>
        <p className="text-xs text-gray-500">
          Preferred materials picked straight from your catalog, each with a priority rank
          and a fallback for when the supplier runs out. Category is just a filter here —
          a real job usually needs several materials together, not one per category.
        </p>
      </div>

      <RuleListDetailPanel
        title="Material Rules"
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
        emptyHint="Add materials from your catalog to set a preference and fallback for each."
        renderListItem={(r) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-800">{r.preferred_item_name}</span>
            <span className="text-xs text-gray-400">{r.category}</span>
            <span className="text-[10px] text-gray-400">Priority {r.material_priority}</span>
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

              <div className="flex gap-2">
                <div className="relative flex-1">
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
                  className={`${inputCls} w-44 shrink-0`}
                >
                  <option value="">All categories</option>
                  {CATEGORY_TYPES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              {itemsLoading ? (
                <p className="text-xs text-gray-400">Loading catalog…</p>
              ) : itemsError ? (
                <p className="text-xs text-red-500">Couldn&apos;t load your catalog: {itemsError.message}</p>
              ) : items.length === 0 ? (
                <p className="text-xs text-amber-600">No items in your catalog yet — upload a pricelist first.</p>
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
                          <p className="truncate text-[11px] text-gray-400">
                            {categoryTypeOf(item) ?? "Uncategorized"} · {item.brand} · {item.unit}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                disabled={checkedItems.length === 0}
                onClick={goToConfigure}
                className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
              >
                Continue with {checkedItems.length} selected
              </button>
            </div>
          ) : mode === "configure" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">Set Priority &amp; Fallback</p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {checkedItems.map((item) => {
                  const code = String(item.item_code);
                  const cfg = perItemConfig[code] ?? { priority: "", fallback: "" };
                  const invalid = touched && !configValid(code);
                  return (
                    <div key={code} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                      <p className="mb-2 text-sm font-semibold text-gray-800">{item.item_name}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Priority
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={cfg.priority}
                            onChange={(e) =>
                              setPerItemConfig((prev) => ({
                                ...prev,
                                [code]: { ...cfg, priority: e.target.value === "" ? "" : Number(e.target.value) },
                              }))
                            }
                            className={inputCls}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Fallback Rule
                          </label>
                          <select
                            value={cfg.fallback}
                            onChange={(e) =>
                              setPerItemConfig((prev) => ({
                                ...prev,
                                [code]: { ...cfg, fallback: e.target.value as MaterialFallbackRule },
                              }))
                            }
                            className={inputCls}
                          >
                            <option value="">Select…</option>
                            {MATERIAL_FALLBACK_RULES.map((f) => (
                              <option key={f}>{f}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {invalid && <p className="mt-1.5 text-[11px] text-red-500">Set both a priority and a fallback rule.</p>}
                    </div>
                  );
                })}
              </div>

              {editable.saveError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t save: {editable.saveError.message}
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
                  disabled={editable.isSaving}
                  className="flex flex-2 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
                >
                  {editable.isSaving ? "Saving…" : `Save ${checkedItems.length} Material Rule${checkedItems.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          ) : mode === "edit" && selected ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">Edit Material Rule</p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  If this rule is used by existing quotations, saving will create a new
                  version — those quotations keep their original values.
                </span>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Material</p>
                <p className="text-sm font-semibold text-gray-800">{selected.preferred_item_name}</p>
                <p className="text-xs text-gray-400">{selected.category}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-600">
                    Priority <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value === "" ? "" : Number(e.target.value))}
                    className={inputCls}
                  />
                  {touched && !(editPriority !== "" && isPositiveNumber(Number(editPriority))) && (
                    <p className="text-xs text-red-500">Must be greater than 0.</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-600">
                    Fallback Rule <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editFallback}
                    onChange={(e) => setEditFallback(e.target.value as MaterialFallbackRule)}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {MATERIAL_FALLBACK_RULES.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  {touched && editFallback === "" && <p className="text-xs text-red-500">Required.</p>}
                </div>
              </div>

              {editable.saveError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t save: {editable.saveError.message}
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editable.isSaving}
                className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
              >
                {editable.isSaving ? "Saving…" : "Save Changes"}
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
                  <p className="text-lg font-bold text-gray-900">{selected.preferred_item_name}</p>
                  <p className="text-sm text-gray-500">{selected.category}</p>
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
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Priority</dt>
                  <dd className="text-gray-700">{selected.material_priority}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Fallback Rule</dt>
                  <dd className="text-gray-700">{selected.fallback_rule}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-400">
              <p className="text-sm">Select a material rule to view it, or add materials from your catalog.</p>
            </div>
          )
        }
      />
    </div>
  );
}