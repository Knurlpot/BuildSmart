"use client";

import { useCallback, useSyncExternalStore } from "react";
import type {
  ExistingRuleSummary,
  LaborRule,
  MaterialRuleEntry,
  PricingStrategyRule,
  ScopeTemplate,
  UnitRule,
} from "./companyRulesTypes";
import { laborRuleScope } from "./companyRulesTypes";

type SaveState<T> = {
  data: T[];
  isLoading: boolean;
  error: Error | null;
};

const NO_ERROR: Error | null = null;

type Store = {
  scopeTemplates: ScopeTemplate[];
  materialRules: MaterialRuleEntry[];
  laborRules: LaborRule[];
  pricingStrategies: PricingStrategyRule[];
  unitRules: UnitRule[];
};

const today = () => new Date().toISOString().slice(0, 10);

const store: Store = {
  scopeTemplates: [],
  materialRules: [],
  laborRules: [],
  pricingStrategies: [],
  unitRules: [],
};

const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return store;
}

export function stagingId(prefix: string) {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

function replaceById<T extends { rule_id: string }>(items: T[], ruleId: string, next: T) {
  return items.map((item) => (item.rule_id === ruleId ? next : item));
}

function createSaveState<T>(data: T[]): SaveState<T> {
  return { data, isLoading: false, error: null };
}

function makeExistingRulesSnapshot(state: Store): ExistingRuleSummary[] {
  return [
    ...state.scopeTemplates.map((rule) => ({
      rule_id: rule.rule_id,
      rule_kind: "scope-template" as const,
      label: rule.template_name,
      detail: rule.service_specialization,
      effective_date: rule.effective_date,
      status: rule.is_active ? "Active" as const : "Disabled" as const,
    })),
    ...state.materialRules.map((rule) => ({
      rule_id: rule.rule_id,
      rule_kind: "material-rule" as const,
      label: rule.preferred_item_name,
      detail: `${rule.category} · ${rule.fallback_rule}`,
      effective_date: rule.effective_date,
      status: rule.is_active ? "Active" as const : "Disabled" as const,
    })),
    ...state.laborRules.map((rule) => ({
      rule_id: rule.rule_id,
      rule_kind: "labor-rule" as const,
      label:
        laborRuleScope(rule) === "Treatment"
          ? (rule.treatment_type ?? "Treatment Rule")
          : laborRuleScope(rule) === "Trade"
            ? (rule.labor_trade ?? "Trade Rule")
            : "General Labor Rule",
      detail:
        laborRuleScope(rule) === "Trade"
          ? `${rule.region ?? "Any region"} · ₱${rule.labor_rate}`
          : `₱${rule.labor_rate}`,
      effective_date: rule.effective_date,
      status: rule.is_active ? "Active" as const : "Disabled" as const,
    })),
    ...state.pricingStrategies.map((rule) => ({
      rule_id: rule.rule_id,
      rule_kind: "pricing-strategy" as const,
      label: `${rule.quotation_tier} Tier`,
      detail: `${rule.markup_percentage}% markup`,
      effective_date: rule.effective_date,
      status: rule.is_active ? "Active" as const : "Disabled" as const,
    })),
    ...state.unitRules.map((rule) => ({
      rule_id: rule.rule_id,
      rule_kind: "unit-rule" as const,
      label: rule.item_name ?? rule.category ?? "Unit Rule",
      detail: `${rule.wastage_allowance_percentage}% wastage`,
      effective_date: rule.effective_date,
      status: rule.is_active ? "Active" as const : "Disabled" as const,
    })),
  ];
}

function useRuleStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function createRuleActions<K extends keyof Store, T extends Store[K][number]>(key: K) {
  return {
    async save(payload: Omit<T, "rule_id" | "is_active" | "effective_date">) {
      const next = {
        ...payload,
        rule_id: stagingId(String(key).slice(0, 2)),
        is_active: true,
        effective_date: today(),
      } as T;
      store[key] = [...store[key], next] as Store[K];
      emit();
      return next;
    },
    async update(ruleId: string, payload: Partial<T>) {
      const current = (store[key] as T[]).find((item) => item.rule_id === ruleId);
      if (!current) throw new Error("Rule not found.");
      const next = { ...current, ...payload } as T;
      store[key] = replaceById(store[key] as T[], ruleId, next) as Store[K];
      emit();
      return next;
    },
    async supersede(ruleId: string, payload: Partial<T>) {
      const current = (store[key] as T[]).find((item) => item.rule_id === ruleId);
      if (!current) throw new Error("Rule not found.");
      const next = {
        ...current,
        ...payload,
        rule_id: stagingId(String(key).slice(0, 2)),
        is_active: true,
        effective_date: today(),
      } as T;
      const disabledCurrent = { ...current, is_active: false } as T;
      store[key] = [...replaceById(store[key] as T[], ruleId, disabledCurrent), next] as Store[K];
      emit();
      return next;
    },
  };
}

export function useCheckRuleUsage() {
  return {
    checkUsage: useCallback(async (_ruleId: string) => ({ in_use: false }), []),
  };
}

export function useScopeTemplates() {
  const snapshot = useRuleStore();
  const actions = createRuleActions<"scopeTemplates", ScopeTemplate>("scopeTemplates");
  return {
    templates: createSaveState(snapshot.scopeTemplates).data,
    isLoading: false,
    error: NO_ERROR,
    refetch: async () => {},
    save: actions.save,
    isSaving: false,
    saveError: NO_ERROR,
    resetSave: () => {},
    update: actions.update,
    supersede: actions.supersede,
  };
}

export function useMaterialRules() {
  const snapshot = useRuleStore();
  const actions = createRuleActions<"materialRules", MaterialRuleEntry>("materialRules");
  return {
    rules: snapshot.materialRules,
    isLoading: false,
    error: NO_ERROR,
    refetch: async () => {},
    save: actions.save,
    update: actions.update,
    supersede: actions.supersede,
  };
}

export function useLaborTradeOptions() {
  return {
    options: ["Mason", "Carpenter", "Painter", "Welder", "Electrician", "Plumber"],
  };
}

export function useLaborRules() {
  const snapshot = useRuleStore();
  const actions = createRuleActions<"laborRules", LaborRule>("laborRules");
  return {
    rules: snapshot.laborRules,
    isLoading: false,
    error: NO_ERROR,
    refetch: async () => {},
    save: actions.save,
    isSaving: false,
    saveError: NO_ERROR,
    resetSave: () => {},
    update: actions.update,
    supersede: actions.supersede,
  };
}

export function usePricingStrategies() {
  const snapshot = useRuleStore();
  const actions = createRuleActions<"pricingStrategies", PricingStrategyRule>("pricingStrategies");
  return {
    strategies: snapshot.pricingStrategies,
    isLoading: false,
    error: NO_ERROR,
    refetch: async () => {},
    save: actions.save,
    isSaving: false,
    saveError: NO_ERROR,
    resetSave: () => {},
    update: actions.update,
    supersede: actions.supersede,
  };
}

export function useUnitRules() {
  const snapshot = useRuleStore();
  const actions = createRuleActions<"unitRules", UnitRule>("unitRules");
  return {
    rules: snapshot.unitRules,
    isLoading: false,
    error: NO_ERROR,
    refetch: async () => {},
    save: actions.save,
    isSaving: false,
    saveError: NO_ERROR,
    resetSave: () => {},
    update: actions.update,
    supersede: actions.supersede,
  };
}

export function useExistingRules() {
  const snapshot = useRuleStore();
  const rules = makeExistingRulesSnapshot(snapshot);

  return {
    rules,
    isLoading: false,
    error: NO_ERROR,
    refetch: async () => {},
    checkUsage: async (_ruleId: string) => ({ in_use: false }),
    isCheckingUsage: false,
    disable: async (ruleId: string) => {
      const collections: (keyof Store)[] = ["scopeTemplates", "materialRules", "laborRules", "pricingStrategies", "unitRules"];
      for (const key of collections) {
        const current = store[key].find((item) => item.rule_id === ruleId);
        if (current) {
          const nextCollection = replaceById(store[key] as Array<{ rule_id: string; is_active: boolean }>, ruleId, {
            ...current,
            is_active: false,
          });
          (store as Record<string, unknown>)[key] = nextCollection;
          emit();
          return;
        }
      }
    },
    isDisabling: false,
    disableError: NO_ERROR,
  };
}