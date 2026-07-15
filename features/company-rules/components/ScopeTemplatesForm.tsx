"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, X } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import {
  useScopeTemplates,
  useCheckRuleUsage,
  stagingId,
} from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useEditableRuleList } from "@/lib/dev/provisional/useEditableRuleList";
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

interface ScopeTemplatesFormProps {
  focusRuleId?: string | null;
  onFocusHandled?: () => void;
}

export function ScopeTemplatesForm({ focusRuleId, onFocusHandled }: ScopeTemplatesFormProps) {
  const { templates, isLoading, error, refetch, save, isSaving, saveError, resetSave, update, supersede } =
    useScopeTemplates();
  const { checkUsage } = useCheckRuleUsage();
  const editable = useEditableRuleList<ScopeTemplate>({ checkUsage, update, supersede, idPrefix: "st" });
  const specializationOptions = useCompanySpecializations();

  const allTemplates = editable.applyOverrides([...editable.localExtra, ...templates]);

  // Part C (jump from Manage Existing Rules) — seeded from the prop at construction, not
  // synced via effect: CompanyRulesShell only renders the active tab, so a jump always
  // means this component mounts fresh with focusRuleId already set. The lookup against
  // allTemplates naturally resolves once the list finishes loading, on its own re-render.
  const [selectedId, setSelectedId] = useState<string | null>(focusRuleId ?? null);
  const [mode, setMode] = useState<"idle" | "add" | "edit">("idle");
  const [name, setName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [othersDescription, setOthersDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  // Runs once on mount only — this consumes the jump, it isn't meant to react to later
  // prop changes (there are none: a real re-jump always remounts this component instead).
  useEffect(() => {
    if (focusRuleId) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameValid = isNonEmpty(name);
  const specializationValid = isNonEmpty(specialization);
  const categoriesValid = categories.length > 0;
  const othersValid = !categories.includes("Others") || isNonEmpty(othersDescription);
  const formValid = nameValid && specializationValid && categoriesValid && othersValid;

  const startAdd = () => {
    setMode("add");
    setSelectedId(null);
    setName("");
    setSpecialization("");
    setCategories([]);
    setOthersDescription("");
    setTouched(false);
    setSavedMessage(false);
    resetSave();
  };

  const startEdit = (t: ScopeTemplate) => {
    setMode("edit");
    setName(t.template_name);
    setSpecialization(t.service_specialization);
    setCategories(t.material_categories);
    setOthersDescription(t.others_description ?? "");
    setTouched(false);
    setSavedMessage(false);
  };

  const toggleCategory = (c: CategoryType) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const buildPayload = () => ({
    template_name: name,
    service_specialization: specialization,
    material_categories: categories,
    others_description: categories.includes("Others") ? othersDescription : undefined,
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
      const optimistic: ScopeTemplate = {
        rule_id: stagingId("st"),
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

  const selected = allTemplates.find((t) => t.rule_id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-900">Scope Templates</h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Optional · Advisory
          </span>
        </div>
        <p className="text-xs text-gray-500">
          A saved reference of the material categories you&apos;d typically expect for a kind
          of job — a memory aid, not an enforced package. Every job still starts from its
          own site assessment; nothing here locks in materials or blocks any other tab.
        </p>
      </div>

      <RuleListDetailPanel
        title="Scope Templates"
        items={allTemplates}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        getId={(t) => t.rule_id}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setMode("idle");
        }}
        onAdd={startAdd}
        emptyHint="Optional — add one only if it's useful as a reference. Skip it entirely if every job you take is different."
        renderListItem={(t) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-800">{t.template_name}</span>
            <span className="text-xs text-gray-400">{t.service_specialization}</span>
            <span className="text-[10px] text-gray-400">{t.material_categories.length} categories</span>
          </div>
        )}
        detail={
          mode === "add" || mode === "edit" ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">
                  {mode === "edit" ? "Edit Scope Template" : "New Scope Template"}
                </p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {mode === "edit" && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    If this rule is used by existing quotations, saving will create a new
                    version — those quotations keep their original values.
                  </span>
                </div>
              )}

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

              {categories.includes("Others") && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-600">
                    Describe &quot;Others&quot; <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={othersDescription}
                    onChange={(e) => setOthersDescription(e.target.value)}
                    placeholder="e.g. Site signage and temporary fencing"
                    maxLength={100}
                    className={inputCls}
                  />
                  {touched && !othersValid && (
                    <p className="text-xs text-red-500">Describe what &quot;Others&quot; covers for this template.</p>
                  )}
                </div>
              )}

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
                {isSaving || editable.isSaving ? "Saving…" : mode === "edit" ? "Save Changes" : "Save Scope Template"}
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
                  <p className="text-lg font-bold text-gray-900">{selected.template_name}</p>
                  <p className="text-sm text-gray-500">{selected.service_specialization}</p>
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
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">Material Categories</p>
                <div className="flex flex-wrap gap-2">
                  {selected.material_categories.map((c) => (
                    <span key={c} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                      {c}
                    </span>
                  ))}
                </div>
                {selected.others_description && (
                  <p className="mt-2 text-xs text-gray-500">
                    <span className="font-semibold text-gray-600">Others:</span> {selected.others_description}
                  </p>
                )}
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