"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, X } from "lucide-react";
import { usePricingStrategies } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { isPercent, warnContingency, warnMarkup, warnOverhead, warnProfitMargin, warnVat } from "@/lib/dev/provisional/ruleValidation";
import {
  QUOTATION_TIERS,
  type PricingStrategyRule,
  type QuotationTier,
} from "@/lib/dev/provisional/companyRulesTypes";

interface SliderPercentFieldProps {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  touched: boolean;
  warn?: (n: number) => string | null;
}

function SliderPercentField({ label, value, onChange, touched, warn }: SliderPercentFieldProps) {
  const valid = value !== "" && isPercent(Number(value));
  const warning = valid && warn ? warn(Number(value)) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-600">
          {label} <span className="text-red-500">*</span>
        </label>
        <span className="text-xs font-bold text-gray-700">{value === "" ? "-" : `${value}%`}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step="0.1"
          value={value === "" ? 0 : value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 flex-1 accent-primary"
        />
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
        />
      </div>
      {touched && !valid && <p className="text-xs text-red-500">Enter a value between 0 and 100.</p>}
      {warning && (
        <p className="flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {warning}
        </p>
      )}
    </div>
  );
}

type StrategyDraft = {
  markup: number | "";
  contingency: number | "";
  overhead: number | "";
  profitMargin: number | "";
  vatEnabled: boolean;
  vatPercentage: number | "";
};

function draftFromStrategy(strategy: PricingStrategyRule | null): StrategyDraft {
  return {
    markup: strategy?.markup_percentage ?? "",
    contingency: strategy?.contingency_percentage ?? "",
    overhead: strategy?.overhead_percentage ?? "",
    profitMargin: strategy?.profit_margin_percentage ?? "",
    vatEnabled: (strategy?.vat_percentage ?? 0) > 0,
    vatPercentage: (strategy?.vat_percentage ?? 0) > 0 ? strategy!.vat_percentage : 12,
  };
}

interface StrategyPanelProps {
  tier: QuotationTier;
  strategy: PricingStrategyRule | null;
  isBusy: boolean;
  error?: Error | null;
  onSave: (tier: QuotationTier, strategy: PricingStrategyRule | null, draft: StrategyDraft) => Promise<PricingStrategyRule | null>;
}

function StrategyPanel({ tier, strategy, isBusy, error, onSave }: StrategyPanelProps) {
  const [draft, setDraft] = useState<StrategyDraft>(() => draftFromStrategy(strategy));
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(strategy === null);

  const markupValid = draft.markup !== "" && isPercent(Number(draft.markup));
  const contingencyValid = draft.contingency !== "" && isPercent(Number(draft.contingency));
  const overheadValid = draft.overhead !== "" && isPercent(Number(draft.overhead));
  const profitValid = draft.profitMargin !== "" && isPercent(Number(draft.profitMargin));
  const vatValid = !draft.vatEnabled || (draft.vatPercentage !== "" && isPercent(Number(draft.vatPercentage)));
  const formValid = markupValid && contingencyValid && overheadValid && profitValid && vatValid;

  const setField = <K extends keyof StrategyDraft>(key: K, value: StrategyDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setTouched(true);
    if (!formValid) return;
    const savedStrategy = await onSave(tier, strategy, draft);
    if (savedStrategy) {
      setSaved(true);
      setTouched(false);
      setIsEditing(false);
    }
  };

  const startEdit = () => {
    setDraft(draftFromStrategy(strategy));
    setTouched(false);
    setSaved(false);
    setIsEditing(true);
  };

  return (
    <section
      className={`flex min-w-0 flex-col gap-4 rounded-xl border-2 bg-white p-4 shadow-sm ${
        tier === "Practical" ? "border-orange-300" : "border-purple-300"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{tier} Pricing</h3>
          <p className="text-xs text-gray-500">{strategy ? `Effective ${strategy.effective_date}` : "Not configured yet"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              strategy?.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
            }`}
          >
            {strategy?.is_active ? "Active" : "Draft"}
          </span>
          {strategy && !isEditing && (
            <button
              type="button"
              onClick={startEdit}
              title={`Edit ${tier} pricing`}
              aria-label={`Edit ${tier} pricing`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary/40 hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {strategy && isEditing && (
            <button
              type="button"
              onClick={() => {
                setDraft(draftFromStrategy(strategy));
                setTouched(false);
                setSaved(false);
                setIsEditing(false);
              }}
              title="Cancel"
              aria-label="Cancel editing"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition hover:border-gray-300 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {tier} pricing saved.
        </div>
      )}

      {isEditing ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <SliderPercentField label="Markup" value={draft.markup} onChange={(v) => setField("markup", v)} touched={touched} warn={warnMarkup} />
            <SliderPercentField
              label="Contingency"
              value={draft.contingency}
              onChange={(v) => setField("contingency", v)}
              touched={touched}
              warn={warnContingency}
            />
            <SliderPercentField
              label="Overhead (OCM)"
              value={draft.overhead}
              onChange={(v) => setField("overhead", v)}
              touched={touched}
              warn={warnOverhead}
            />
            <SliderPercentField
              label="Profit Margin"
              value={draft.profitMargin}
              onChange={(v) => setField("profitMargin", v)}
              touched={touched}
              warn={warnProfitMargin}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
            <label className="flex items-center gap-2.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.vatEnabled}
                onChange={(e) => setField("vatEnabled", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
              />
              Apply VAT
            </label>
            {draft.vatEnabled && (
              <SliderPercentField
                label="VAT Rate"
                value={draft.vatPercentage}
                onChange={(v) => setField("vatPercentage", v)}
                touched={touched}
                warn={warnVat}
              />
            )}
            <p className="text-[11px] text-gray-400">VAT appears as a separate quotation line and is applied per quote.</p>
          </div>
        </>
      ) : strategy ? (
        <dl className="grid gap-4 rounded-xl border border-gray-100 bg-gray-50/60 p-4 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Markup</dt>
            <dd className="text-gray-700">{strategy.markup_percentage}%</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contingency</dt>
            <dd className="text-gray-700">{strategy.contingency_percentage}%</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Overhead</dt>
            <dd className="text-gray-700">{strategy.overhead_percentage}%</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Profit Margin</dt>
            <dd className="text-gray-700">{strategy.profit_margin_percentage}%</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">VAT Rate</dt>
            <dd className="text-gray-700">{strategy.vat_percentage > 0 ? `${strategy.vat_percentage}%` : "Not applied"}</dd>
          </div>
        </dl>
      ) : null}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t save: {error.message}
        </div>
      )}

      {isEditing && (
        <button
          type="button"
          onClick={handleSave}
          disabled={isBusy}
          className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
        >
          {isBusy ? "Saving..." : `Save ${tier} Pricing`}
        </button>
      )}
    </section>
  );
}

interface PricingStrategyFormProps {
  focusRuleId?: string | null;
  onFocusHandled?: () => void;
}

export function PricingStrategyForm({ focusRuleId, onFocusHandled }: PricingStrategyFormProps) {
  const { strategies, isLoading, error, save, isSaving, saveError, update } = usePricingStrategies();
  const [localStrategies, setLocalStrategies] = useState<PricingStrategyRule[]>([]);
  const allStrategies = useMemo(() => [...localStrategies, ...strategies], [localStrategies, strategies]);

  useEffect(() => {
    if (focusRuleId) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeStrategyFor = (tier: QuotationTier) =>
    allStrategies.find((strategy) => strategy.quotation_tier === tier && strategy.is_active) ??
    allStrategies.find((strategy) => strategy.quotation_tier === tier) ??
    null;

  const handleSave = async (tier: QuotationTier, strategy: PricingStrategyRule | null, draft: StrategyDraft) => {
    const payload = {
      quotation_tier: tier,
      markup_percentage: Number(draft.markup),
      contingency_percentage: Number(draft.contingency),
      overhead_percentage: Number(draft.overhead),
      profit_margin_percentage: Number(draft.profitMargin),
      vat_percentage: draft.vatEnabled ? Number(draft.vatPercentage) : 0,
    };

    try {
      if (strategy) {
        const updated = await update(strategy.rule_id, payload);
        setLocalStrategies((current) => [updated, ...current.filter((item) => item.rule_id !== updated.rule_id)]);
        return updated;
      }

      const created = await save(payload);
      setLocalStrategies((current) => [created, ...current.filter((item) => item.rule_id !== created.rule_id)]);
      return created;
    } catch {
      return null;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Pricing Strategy</h2>
        <p className="text-xs text-gray-500">Modify the two quotation pricing options.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load pricing strategies: {error.message}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {QUOTATION_TIERS.map((tier) => (
          <StrategyPanel
            key={`${tier}-${activeStrategyFor(tier)?.rule_id ?? "new"}`}
            tier={tier}
            strategy={activeStrategyFor(tier)}
            isBusy={isLoading || isSaving}
            error={saveError}
            onSave={handleSave}
          />
        ))}
      </div>
    </div>
  );
}
