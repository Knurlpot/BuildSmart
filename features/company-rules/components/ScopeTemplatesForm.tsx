"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import { useScopeTemplates, stagingId } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { isNonEmpty } from "@/lib/dev/provisional/ruleValidation";
import type { ScopeTemplate } from "@/lib/dev/provisional/companyRulesTypes";
import { useFetch } from "@/hooks/useFetch";
import { useAuth } from "@/providers/AuthProvider";
import { CATEGORY_TYPES, type CategoryType } from "@/types/entities/category";
import type { Company } from "@/types/entities";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

function useCompanySpecializations(): string[] {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;
  const endpoint = companyId !== undefined && companyId !== null ? `/api/company/${companyId}` : null;
  const { data } = useFetch<Company>(endpoint);
  if (!data) return [];
  return [data.specialization_1, data.specialization_2, data.specialization_3].filter(
    (s): s is string => !!s && s.trim().length > 0
  );
}

export function ScopeTemplatesForm() {
  const { templates, isLoading, error, refetch, save, isSaving, saveError, resetSave } = useScopeTemplates();
  const specializationOptions = useCompanySpecializations();

  const [localExtra, setLocalExtra] = useState<ScopeTemplate[]>([]);
  const allTemplates = [...localExtra, ...templates];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  const nameValid = isNonEmpty(name);
  const specializationValid = isNonEmpty(specialization);
  const categoriesValid = categories.length > 0;
  const formValid = nameValid && specializationValid && categoriesValid;

  const startAdd = () => {
    setAdding(true);
    setSelectedId(null);
    setName("");
    setSpecialization("");
    setCategories([]);
    setTouched(false);
    setSavedMessage(false);
    resetSave();
  };

  const toggleCategory = (c: CategoryType) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const handleSave = async () => {
    setTouched(true);
    if (!formValid) return;
    try {
      await save({ template_name: name, service_specialization: specialization, material_categories: categories });
      const optimistic: ScopeTemplate = {
        scope_template_id: stagingId("st"),
        template_name: name,
        service_specialization: specialization,
        material_categories: categories,
        status: "Active",
      };
      setLocalExtra((prev) => [optimistic, ...prev]);
      setAdding(false);
      setSelectedId(optimistic.scope_template_id);
      setSavedMessage(true);
    } catch {
      // surfaced via saveError below — no fabricated success
    }
  };

  const selected = allTemplates.find((t) => t.scope_template_id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Scope Templates</h2>
        <p className="text-xs text-gray-500">
          Configure Scope Templates → Select Service Specialization. A template groups the
          material categories relevant to one service line.
        </p>
      </div>

      <RuleListDetailPanel
        title="Scope Templates"
        items={allTemplates}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        getId={(t) => t.scope_template_id}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setAdding(false);
        }}
        onAdd={startAdd}
        emptyHint="Add a template to define which material categories a service line uses."
        renderListItem={(t) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-800">{t.template_name}</span>
            <span className="text-xs text-gray-400">{t.service_specialization}</span>
            <span className="text-[10px] text-gray-400">{t.material_categories.length} categories</span>
          </div>
        )}
        detail={
          adding ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">New Scope Template</p>
                <button type="button" onClick={() => setAdding(false)} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Template Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Standard Roof Retrofit"
                  className={inputCls}
                />
                {touched && !nameValid && <p className="text-xs text-red-500">Template name is required.</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Service Specialization <span className="text-red-500">*</span>
                </label>
                <select value={specialization} onChange={(e) => setSpecialization(e.target.value)} className={inputCls}>
                  <option value="">Select…</option>
                  {specializationOptions.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                {specializationOptions.length === 0 && (
                  <p className="text-xs text-gray-400">
                    No specializations found on your company profile yet — add one under Account &amp; Company Profile.
                  </p>
                )}
                {touched && !specializationValid && <p className="text-xs text-red-500">Select a specialization.</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Applicable Material Categories <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_TYPES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCategory(c)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        categories.includes(c)
                          ? "border-primary bg-orange-50 text-primary"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {touched && !categoriesValid && <p className="text-xs text-red-500">Select at least one category.</p>}
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
                {isSaving ? "Saving…" : "Save Scope Template"}
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
                <p className="text-lg font-bold text-gray-900">{selected.template_name}</p>
                <p className="text-sm text-gray-500">{selected.service_specialization}</p>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">Material Categories</p>
                <div className="flex flex-wrap gap-2">
                  {selected.material_categories.map((c) => (
                    <span key={c} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-400">
              <p className="text-sm">Select a template to view it, or add a new one.</p>
            </div>
          )
        }
      />
    </div>
  );
}
