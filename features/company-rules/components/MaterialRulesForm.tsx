"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import {
  useMaterialRules,
  useCheckRuleUsage,
  useScopeTemplates,
  stagingId,
} from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useEditableRuleList } from "@/lib/dev/provisional/useEditableRuleList";
import { isPositiveNumber } from "@/lib/dev/provisional/ruleValidation";
import {
  MATERIAL_FALLBACK_RULES,
  type MaterialFallbackRule,
  type MaterialRuleEntry,
} from "@/lib/dev/provisional/companyRulesTypes";
import { useItemsCatalog } from "@/hooks/useItemsCatalog";
import type { CategoryType } from "@/types/entities/category";
import type { ScopeWizardState } from "./CompanyRulesShell";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

interface MaterialRulesFormProps {
  /** Part A — when set, the template dropdown is pre-locked to this template and a step
   * banner + "Continue to Unit Rules" replace the normal free-browsing header. */
  wizard?: Pick<ScopeWizardState, "scopeRuleId" | "templateName" | "categories"> | null;
  onWizardAdvance?: () => void;
}

export function MaterialRulesForm({ wizard, onWizardAdvance }: MaterialRulesFormProps) {
  const { templates, isLoading: templatesLoading, error: templatesError } = useScopeTemplates();
  const { rules, isLoading: rulesLoading, error: rulesError, save, update, supersede } = useMaterialRules();
  const { checkUsage } = useCheckRuleUsage();
  const editable = useEditableRuleList<MaterialRuleEntry>({ checkUsage, update, supersede, idPrefix: "mr" });
  const { items, isLoading: itemsLoading, itemsInCategory } = useItemsCatalog();

  // Not memoized: applyOverrides closes over per-render state, so it isn't a stable
  // reference anyway — recomputing this small, fixture-sized list every render is cheap.
  const allRules = editable.applyOverrides([...editable.localExtra, ...rules]);

  const [scopeTemplateId, setScopeTemplateId] = useState(wizard?.scopeRuleId ?? "");
  const template = wizard
    ? { rule_id: wizard.scopeRuleId, template_name: wizard.templateName, material_categories: wizard.categories }
    : (templates.find((t) => t.rule_id === scopeTemplateId) ?? null);

  const [editingCategory, setEditingCategory] = useState<CategoryType | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [materialSearch, setMaterialSearch] = useState("");
  const [material, setMaterial] = useState("");
  const [priority, setPriority] = useState<number | "">("");
  const [fallback, setFallback] = useState<MaterialFallbackRule | "">("");
  const [touched, setTouched] = useState(false);

  const rulesForTemplate = useMemo(
    () => allRules.filter((r) => r.scope_rule_id === (wizard?.scopeRuleId ?? scopeTemplateId)),
    [allRules, wizard, scopeTemplateId]
  );

  // Not memoized: in wizard mode `template` is a fresh literal every render (cheap to
  // recompute against), so memoizing here would just recompute every time anyway.
  const missingCategories = template
    ? template.material_categories.filter((c) => !rulesForTemplate.some((r) => r.category === c))
    : [];
  const allConfigured = !!template && missingCategories.length === 0;

  const startEdit = (category: CategoryType) => {
    const configured = rulesForTemplate.find((r) => r.category === category);
    setEditingCategory(category);
    setEditingRuleId(configured?.rule_id ?? null);
    setMaterial(configured?.preferred_item_code ?? "");
    setMaterialSearch(configured?.preferred_item_name ?? "");
    setPriority(configured?.material_priority ?? "");
    setFallback(configured?.fallback_rule ?? "");
    setTouched(false);
  };

  const materialValid = material.trim().length > 0;
  const priorityValid = priority !== "" && isPositiveNumber(Number(priority));
  const fallbackValid = fallback !== "";
  const rowValid = materialValid && priorityValid && fallbackValid;

  const handleSaveRow = async (category: CategoryType) => {
    setTouched(true);
    if (!rowValid) return;
    const payload = {
      scope_rule_id: wizard?.scopeRuleId ?? scopeTemplateId,
      category,
      preferred_item_code: material,
      preferred_item_name: materialSearch,
      material_priority: Number(priority),
      fallback_rule: fallback as MaterialFallbackRule,
    };
    if (editingRuleId) {
      const resultId = await editable.saveEdit(editingRuleId, payload);
      if (resultId) setEditingCategory(null);
      return;
    }
    try {
      await save(payload);
      editable.addCreated({
        rule_id: stagingId("mr"),
        ...payload,
        is_active: true,
        effective_date: new Date().toISOString().slice(0, 10),
      });
      setEditingCategory(null);
    } catch {
      // surfaced via editable.saveError below — no fabricated success
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Material Rules</h2>
        <p className="text-xs text-gray-500">
          Select a scope template, then configure a preferred material for every category it uses.
        </p>
      </div>

      {wizard && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-orange-50/60 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Step 2 of 3 — Material Rules</p>
            <p className="text-sm text-gray-700">
              You&apos;ve selected {wizard.categories.length} categor{wizard.categories.length === 1 ? "y" : "ies"} for{" "}
              <strong>{wizard.templateName}</strong>. Configure a preferred material for each.
            </p>
          </div>
          <button
            type="button"
            onClick={onWizardAdvance}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
          >
            Continue to Unit Rules <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {!wizard && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <label className="mb-1.5 block text-xs font-semibold text-gray-600">Scope Template</label>
          <QueryState
            isLoading={templatesLoading}
            error={templatesError}
            isEmpty={templates.length === 0}
            emptyTitle="No scope templates yet"
            emptyHint="Configure a Scope Template first — Material Rules build on top of it."
            minHeight={60}
          >
            <select
              value={scopeTemplateId}
              onChange={(e) => {
                setScopeTemplateId(e.target.value);
                setEditingCategory(null);
              }}
              className={inputCls}
            >
              <option value="">Select a scope template…</option>
              {templates.map((t) => (
                <option key={t.rule_id} value={t.rule_id}>
                  {t.template_name}
                </option>
              ))}
            </select>
          </QueryState>
        </div>
      )}

      {template && (
        <>
          {allConfigured ? (
            <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> All required materials configured for this template.
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {missingCategories.length} of {template.material_categories.length} categories still need a material rule.
            </div>
          )}

          {editable.saveError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Couldn&apos;t save that material rule: {editable.saveError.message}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <QueryState
              isLoading={rulesLoading}
              error={rulesError}
              isEmpty={false}
              emptyTitle="No material rules yet"
              minHeight={0}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Preferred Material</th>
                    <th className="px-4 py-2.5">Priority</th>
                    <th className="px-4 py-2.5">Fallback Rule</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {template.material_categories.map((category) => {
                    const configured = rulesForTemplate.find((r) => r.category === category);
                    const editing = editingCategory === category;
                    const categoryItems = itemsInCategory(category);

                    if (editing) {
                      return (
                        <tr key={category} className="border-b border-gray-50 bg-amber-50/30">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{category}</td>
                          <td className="px-4 py-2.5">
                            {itemsLoading ? (
                              <p className="text-[11px] text-gray-400">Loading catalog…</p>
                            ) : items.length === 0 ? (
                              <p className="text-[11px] text-amber-600">
                                No items in your catalog yet — upload a pricelist first.
                              </p>
                            ) : (
                              <>
                                <input
                                  list={`materials-${category}`}
                                  value={materialSearch}
                                  onChange={(e) => {
                                    const typed = e.target.value;
                                    setMaterialSearch(typed);
                                    const match = categoryItems.find((i) => i.item_name === typed);
                                    setMaterial(match ? String(match.item_code) : "");
                                  }}
                                  placeholder="Search or select a material…"
                                  className={inputCls}
                                />
                                <datalist id={`materials-${category}`}>
                                  {categoryItems.map((i) => (
                                    <option key={i.item_code} value={i.item_name} />
                                  ))}
                                </datalist>
                              </>
                            )}
                            {touched && !materialValid && <p className="mt-1 text-[11px] text-red-500">Required</p>}
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              min={1}
                              value={priority}
                              onChange={(e) => setPriority(e.target.value === "" ? "" : Number(e.target.value))}
                              className={`${inputCls} w-16`}
                            />
                            {touched && !priorityValid && <p className="mt-1 text-[11px] text-red-500">&gt; 0</p>}
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={fallback}
                              onChange={(e) => setFallback(e.target.value as MaterialFallbackRule)}
                              className={inputCls}
                            >
                              <option value="">Select…</option>
                              {MATERIAL_FALLBACK_RULES.map((f) => (
                                <option key={f}>{f}</option>
                              ))}
                            </select>
                            {touched && !fallbackValid && <p className="mt-1 text-[11px] text-red-500">Required</p>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                disabled={editable.isSaving}
                                onClick={() => handleSaveRow(category)}
                                className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground disabled:opacity-60"
                              >
                                {editable.isSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCategory(null)}
                                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    // Part C: the whole row is the click target, not just the far-right control.
                    return (
                      <tr
                        key={category}
                        onClick={() => startEdit(category)}
                        className="cursor-pointer border-b border-gray-50 transition hover:bg-gray-50/60"
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-800">{category}</td>
                        <td className="px-4 py-2.5 text-gray-600">{configured?.preferred_item_name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{configured?.material_priority ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{configured?.fallback_rule ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          {configured ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                              Configured
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              Needs attention — Configure
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </QueryState>
          </div>
        </>
      )}
    </div>
  );
}
