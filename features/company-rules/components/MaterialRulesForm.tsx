"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import {
  useMaterialRules,
  useMaterialsByCategory,
  useScopeTemplates,
  stagingId,
} from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { isPositiveNumber } from "@/lib/dev/provisional/ruleValidation";
import {
  MATERIAL_FALLBACK_RULES,
  type MaterialFallbackRule,
  type MaterialRuleEntry,
} from "@/lib/dev/provisional/companyRulesTypes";
import type { CategoryType } from "@/types/entities/category";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

export function MaterialRulesForm() {
  const { templates, isLoading: templatesLoading, error: templatesError } = useScopeTemplates();
  const {
    rules,
    isLoading: rulesLoading,
    error: rulesError,
    save,
    isSaving,
    saveError,
  } = useMaterialRules();
  const { materialsByCategory } = useMaterialsByCategory();

  const [localExtra, setLocalExtra] = useState<MaterialRuleEntry[]>([]);
  const allRules = useMemo(() => [...localExtra, ...rules], [localExtra, rules]);

  const [scopeTemplateId, setScopeTemplateId] = useState("");
  const template = templates.find((t) => t.scope_template_id === scopeTemplateId) ?? null;

  const [editingCategory, setEditingCategory] = useState<CategoryType | null>(null);
  const [material, setMaterial] = useState("");
  const [priority, setPriority] = useState<number | "">("");
  const [fallback, setFallback] = useState<MaterialFallbackRule | "">("");
  const [touched, setTouched] = useState(false);

  const rulesForTemplate = useMemo(
    () => allRules.filter((r) => r.scope_template_id === scopeTemplateId),
    [allRules, scopeTemplateId]
  );

  const missingCategories = useMemo(
    () => (template ? template.material_categories.filter((c) => !rulesForTemplate.some((r) => r.category === c)) : []),
    [template, rulesForTemplate]
  );
  const allConfigured = !!template && missingCategories.length === 0;

  const startEdit = (category: CategoryType) => {
    setEditingCategory(category);
    setMaterial("");
    setPriority("");
    setFallback("");
    setTouched(false);
  };

  const materialValid = material.trim().length > 0;
  const priorityValid = priority !== "" && isPositiveNumber(Number(priority));
  const fallbackValid = fallback !== "";
  const rowValid = materialValid && priorityValid && fallbackValid;

  const handleSaveRow = async (category: CategoryType) => {
    setTouched(true);
    if (!rowValid) return;
    try {
      await save({
        scope_template_id: scopeTemplateId,
        category,
        preferred_material: material,
        material_priority: Number(priority),
        fallback_rule: fallback as MaterialFallbackRule,
      });
      const optimistic: MaterialRuleEntry = {
        material_rule_id: stagingId("mr"),
        scope_template_id: scopeTemplateId,
        category,
        preferred_material: material,
        material_priority: Number(priority),
        fallback_rule: fallback as MaterialFallbackRule,
      };
      setLocalExtra((prev) => [optimistic, ...prev]);
      setEditingCategory(null);
    } catch {
      // surfaced via saveError below — no fabricated success
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
              <option key={t.scope_template_id} value={t.scope_template_id}>
                {t.template_name}
              </option>
            ))}
          </select>
        </QueryState>
      </div>

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

          {saveError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Couldn&apos;t save that material rule: {saveError.message}
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

                    if (editing) {
                      return (
                        <tr key={category} className="border-b border-gray-50 bg-amber-50/30">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{category}</td>
                          <td className="px-4 py-2.5">
                            <select value={material} onChange={(e) => setMaterial(e.target.value)} className={inputCls}>
                              <option value="">Select…</option>
                              {(materialsByCategory?.[category] ?? []).map((m) => (
                                <option key={m}>{m}</option>
                              ))}
                            </select>
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
                                disabled={isSaving}
                                onClick={() => handleSaveRow(category)}
                                className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground disabled:opacity-60"
                              >
                                {isSaving ? "Saving…" : "Save"}
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

                    return (
                      <tr key={category} className="border-b border-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{category}</td>
                        <td className="px-4 py-2.5 text-gray-600">{configured?.preferred_material ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{configured?.material_priority ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{configured?.fallback_rule ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          {configured ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                              Configured
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(category)}
                              className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 transition hover:bg-amber-200"
                            >
                              Needs attention — Configure
                            </button>
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
