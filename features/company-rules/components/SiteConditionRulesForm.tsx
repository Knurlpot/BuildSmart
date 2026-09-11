"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Plus, Save, Trash2 } from "lucide-react";
import { useSiteConditionRules } from "@/hooks/useSiteConditionRules";
import {
  SITE_CONDITION_FIELDS,
  siteConditionField,
  type SiteConditionEffectType,
  type SiteConditionFieldKey,
  type SiteConditionOperator,
  type SiteConditionPricingMethod,
  type SiteConditionRule,
  type SiteConditionRuleEffect,
} from "@/types/entities/site-condition-rule";

const inputClass = "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";
type EditableRule = Omit<SiteConditionRule, "rule_id" | "is_active" | "effective_date">;

function newEffect(index: number): SiteConditionRuleEffect {
  return { effect_key: `effect-${Date.now()}-${index}`, effect_type: "line_item", label: "", description: "", pricing_method: "fixed", rate: 0, percentage: null, schedule_days: null };
}

function emptyRule(): EditableRule {
  return { rule_name: "", condition_field: "site_access", operator: "equals", trigger_value: "Normal access", scope_of_work: null, effects: [newEffect(0)] };
}

const EFFECT_LABELS: Record<SiteConditionEffectType, string> = {
  line_item: "Quotation line item",
  equipment: "Equipment",
  safety: "Safety / temporary works",
  productivity: "Productivity adjustment",
  schedule: "Schedule allowance",
  warning: "Assessment warning",
};

const PRICING_LABELS: Record<SiteConditionPricingMethod, string> = {
  fixed: "Fixed amount",
  per_sqm: "Per sqm",
  labor_percentage: "Percentage of labor",
  manual_review: "No automatic price",
};

export function SiteConditionRulesForm() {
  const { rules, isLoading, error, save, update, disable, isSaving, saveError } = useSiteConditionRules();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableRule>(emptyRule);
  const [message, setMessage] = useState<string | null>(null);
  const selected = rules.find((rule) => rule.rule_id === selectedId) ?? null;
  const field = siteConditionField(draft.condition_field);

  const invalidReason = useMemo(() => {
    if (!draft.rule_name.trim()) return "Enter a rule name.";
    if (!draft.trigger_value.trim()) return "Enter a trigger value.";
    if (draft.effects.length === 0) return "Add at least one effect.";
    if (draft.effects.some((effect) => !effect.label.trim())) return "Name every effect.";
    return null;
  }, [draft]);

  const startNew = () => { setSelectedId(null); setDraft(emptyRule()); setMessage(null); };
  const selectRule = (rule: SiteConditionRule) => {
    setSelectedId(rule.rule_id);
    setMessage(null);
    setDraft({ rule_name: rule.rule_name, condition_field: rule.condition_field, operator: rule.operator, trigger_value: rule.trigger_value, scope_of_work: rule.scope_of_work, effects: rule.effects.map((effect) => ({ ...effect })) });
  };
  const updateEffect = (index: number, patch: Partial<SiteConditionRuleEffect>) => setDraft((current) => ({ ...current, effects: current.effects.map((effect, effectIndex) => effectIndex === index ? { ...effect, ...patch } : effect) }));

  const changeEffectType = (index: number, effectType: SiteConditionEffectType) => {
    const forcedPricing: Partial<Record<SiteConditionEffectType, SiteConditionPricingMethod>> = { productivity: "labor_percentage", schedule: "manual_review", warning: "manual_review" };
    updateEffect(index, { effect_type: effectType, pricing_method: forcedPricing[effectType] ?? "fixed", rate: forcedPricing[effectType] ? null : 0, percentage: effectType === "productivity" ? 0 : null, schedule_days: effectType === "schedule" ? 0 : null });
  };

  const handleSave = async () => {
    if (invalidReason) return;
    setMessage(null);
    try {
      if (selectedId) {
        await update(selectedId, draft);
        setMessage("Rule updated.");
      } else {
        await save(draft);
        setSelectedId(null);
        setDraft(emptyRule());
        setMessage("Site condition rule created.");
      }
    } catch { /* mutation error is rendered below */ }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-h-10 items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Site Condition Rules</h2>
          <p className="text-xs font-semibold text-gray-500">{rules.length} configured</p>
        </div>
        <button type="button" onClick={startNew} className="shrink-0 rounded-xl bg-primary px-7 py-2 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)">
          <span className="inline-flex items-center gap-1.5">Add <Plus className="h-4 w-4" /></span>
        </button>
      </div>

      <div className="grid min-h-[620px] items-start gap-5 lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.55fr)] xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.7fr)]">
        <aside className="min-w-0">
          {isLoading && <div className="flex min-h-112 items-center justify-center rounded-2xl border border-gray-100 bg-white text-xs text-gray-400">Loading rules…</div>}
          {error && <div className="flex min-h-112 items-center justify-center rounded-2xl border border-red-100 bg-red-50 p-4 text-center text-xs text-red-600">Couldn&apos;t load site condition rules.</div>}
          <div className="grid max-h-[38rem] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1 [scrollbar-width:thin]">
          {rules.map((rule) => (
            <button key={rule.rule_id} type="button" onClick={() => selectRule(rule)} aria-current={selectedId === rule.rule_id ? "true" : undefined} className={`group flex min-h-28 w-full items-start rounded-xl border p-4 text-left shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 ${selectedId === rule.rule_id ? "border-primary bg-primary text-primary-foreground ring-1 ring-primary/20 [&_*]:!text-white [&_.rounded-full]:!bg-white/20" : "border-gray-200 bg-white hover:border-primary/40 hover:shadow-md"} ${!rule.is_active ? "opacity-50" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-gray-800">{rule.rule_name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${rule.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}>{rule.is_active ? "Active" : "Disabled"}</span>
                </span>
                <span className="mt-1 block text-[11px] text-gray-500">{siteConditionField(rule.condition_field)?.label}: {rule.trigger_value}</span>
                <span className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{rule.effects.length} effect{rule.effects.length === 1 ? "" : "s"}</span>
              </span>
            </button>
          ))}
            {!isLoading && !error && rules.length === 0 && <div className="flex min-h-112 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-xs text-gray-500">No site condition rules yet. Use Add to define the company&apos;s response to a project condition.</div>}
          </div>
        </aside>

      <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:min-h-[620px]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><h2 className="text-base font-bold text-gray-900">{selected ? "Edit rule" : "Create rule"}</h2><p className="text-xs text-gray-500">Define the trigger, then add every action your company normally takes.</p></div>
          {selected?.is_active && <button type="button" onClick={() => void disable(selected.rule_id)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Disable</button>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-gray-600 md:col-span-2">Rule name<input value={draft.rule_name} onChange={(event) => setDraft({ ...draft, rule_name: event.target.value })} className={inputClass} placeholder="e.g. Multi-storey exterior access" /></label>
          <label className="space-y-1.5 text-xs font-semibold text-gray-600">Project condition
            <select value={draft.condition_field} onChange={(event) => { const conditionField = event.target.value as SiteConditionFieldKey; const nextField = siteConditionField(conditionField); setDraft({ ...draft, condition_field: conditionField, operator: nextField?.valueType === "number" ? "gte" : "equals", trigger_value: nextField?.options[0] ?? "" }); }} className={inputClass}>
              {SITE_CONDITION_FIELDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <label className="space-y-1.5 text-xs font-semibold text-gray-600">Trigger
              <select value={draft.operator} onChange={(event) => setDraft({ ...draft, operator: event.target.value as SiteConditionOperator })} className={inputClass} disabled={field?.valueType !== "number"}><option value="equals">Equals</option><option value="gte">At least</option><option value="lte">At most</option></select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-gray-600">Value
              {field?.valueType === "select" ? <select value={draft.trigger_value} onChange={(event) => setDraft({ ...draft, trigger_value: event.target.value })} className={inputClass}>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input type="number" min="0" value={draft.trigger_value} onChange={(event) => setDraft({ ...draft, trigger_value: event.target.value })} className={inputClass} />}
            </label>
          </div>
          <label className="space-y-1.5 text-xs font-semibold text-gray-600 md:col-span-2">Scope of work <span className="font-normal text-gray-400">(optional; blank applies to all)</span><input value={draft.scope_of_work ?? ""} onChange={(event) => setDraft({ ...draft, scope_of_work: event.target.value || null })} className={inputClass} placeholder="e.g. Exterior waterproofing" /></label>
        </div>
        {draft.condition_field === "hazard_exposure" && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Use an assessment warning for seismic, landslide, waterway, or major structural hazards. Temporary controls may be priced, but a generic rule must not replace engineering review.
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div><h3 className="text-sm font-bold text-gray-900">Effects</h3><p className="text-xs text-gray-500">Effects are proposed to the estimator and can be excluded per segment.</p></div>
          <button type="button" onClick={() => setDraft({ ...draft, effects: [...draft.effects, newEffect(draft.effects.length)] })} className="flex items-center gap-1 rounded-lg border border-primary/30 px-3 py-2 text-xs font-bold text-primary hover:bg-orange-50"><Plus className="h-3.5 w-3.5" /> Add effect</button>
        </div>

        <div className="mt-3 space-y-3">
          {draft.effects.map((effect, index) => (
            <div key={effect.effect_key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-[11px] font-semibold text-gray-600">Effect type<select value={effect.effect_type} onChange={(event) => changeEffectType(index, event.target.value as SiteConditionEffectType)} className={inputClass}>{Object.entries(EFFECT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="space-y-1 text-[11px] font-semibold text-gray-600">Effect name<input value={effect.label} onChange={(event) => updateEffect(index, { label: event.target.value })} className={inputClass} placeholder="e.g. Scaffolding and access equipment" /></label>
                {!['productivity', 'schedule', 'warning'].includes(effect.effect_type) && <label className="space-y-1 text-[11px] font-semibold text-gray-600">Pricing method<select value={effect.pricing_method} onChange={(event) => updateEffect(index, { pricing_method: event.target.value as SiteConditionPricingMethod, rate: event.target.value === 'manual_review' ? null : effect.rate ?? 0 })} className={inputClass}>{(['fixed', 'per_sqm', 'manual_review'] as const).map((method) => <option key={method} value={method}>{PRICING_LABELS[method]}</option>)}</select></label>}
                {['fixed', 'per_sqm'].includes(effect.pricing_method) && <label className="space-y-1 text-[11px] font-semibold text-gray-600">Rate (₱)<input type="number" min="0" value={effect.rate ?? 0} onChange={(event) => updateEffect(index, { rate: Number(event.target.value) })} className={inputClass} /></label>}
                {effect.effect_type === 'productivity' && <label className="space-y-1 text-[11px] font-semibold text-gray-600 md:col-span-2">Productivity reduction (%)<input type="number" min="0" max="90" value={effect.percentage ?? 0} onChange={(event) => updateEffect(index, { percentage: Number(event.target.value) })} className={inputClass} /></label>}
                {effect.effect_type === 'schedule' && <label className="space-y-1 text-[11px] font-semibold text-gray-600 md:col-span-2">Additional working days<input type="number" min="0" value={effect.schedule_days ?? 0} onChange={(event) => updateEffect(index, { schedule_days: Number(event.target.value) })} className={inputClass} /></label>}
                <label className="space-y-1 text-[11px] font-semibold text-gray-600 md:col-span-2">Explanation<input value={effect.description} onChange={(event) => updateEffect(index, { description: event.target.value })} className={inputClass} placeholder="Why this is needed and what it covers" /></label>
              </div>
              <button type="button" onClick={() => setDraft({ ...draft, effects: draft.effects.filter((_, effectIndex) => effectIndex !== index) })} className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-red-500"><Trash2 className="h-3.5 w-3.5" /> Remove effect</button>
            </div>
          ))}
        </div>

        {(invalidReason || saveError) && <p className="mt-4 flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="h-4 w-4" />{saveError?.message ?? invalidReason}</p>}
        {message && <p className="mt-4 flex items-center gap-1.5 text-xs text-green-700"><Check className="h-4 w-4" />{message}</p>}
        <button type="button" onClick={() => void handleSave()} disabled={!!invalidReason || isSaving} className="mt-5 flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" /> {isSaving ? "Saving…" : selected ? "Update Rule" : "Create Rule"}</button>
      </section>
      </div>
    </div>
  );
}
