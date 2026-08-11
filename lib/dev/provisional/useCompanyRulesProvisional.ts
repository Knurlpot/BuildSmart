"use client";

import { useCallback } from "react";
import { useFetch } from "@/hooks/useFetch";
import { useMutation } from "@/hooks/useMutation";
import type {
  ExistingRuleSummary,
  LaborRule,
  MaterialRuleEntry,
  PricingStrategyRule,
  ScopeTemplate,
  SupplierRuleEntry,
  UnitRule,
} from "./companyRulesTypes";

type CompanyRulesPayload = {
  scopeTemplates: ScopeTemplate[];
  materialRules: MaterialRuleEntry[];
  laborRules: LaborRule[];
  pricingStrategies: PricingStrategyRule[];
  unitRules: UnitRule[];
  supplierRules: SupplierRuleEntry[];
  existingRules: ExistingRuleSummary[];
};

const EMPTY_RULES: CompanyRulesPayload = {
  scopeTemplates: [],
  materialRules: [],
  laborRules: [],
  pricingStrategies: [],
  unitRules: [],
  supplierRules: [],
  existingRules: [],
};

let nextId = 1;

export function stagingId(prefix: string) {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

function useCompanyRulesData() {
  const { data, isLoading, error, refetch } = useFetch<CompanyRulesPayload>("/api/company-rules");
  return { data: data ?? EMPTY_RULES, isLoading, error, refetch };
}

function useRuleMutation<T>(kind: string, refetch: () => void) {
  const mutation = useMutation<CompanyRulesPayload>();

  const save = async (payload: Omit<T, "rule_id" | "is_active" | "effective_date">) => {
    const next = await mutation.mutate(`/api/company-rules/${kind}`, payload, "POST");
    window.dispatchEvent(new CustomEvent("buildsmart:company-rules-changed", { detail: { kind } }));
    refetch();
    return latestForKind<T>(kind, next);
  };

  const update = async (ruleId: string, payload: Partial<T>) => {
    const next = await mutation.mutate(`/api/company-rules/${kind}/${ruleId}`, payload, "PATCH");
    window.dispatchEvent(new CustomEvent("buildsmart:company-rules-changed", { detail: { kind } }));
    refetch();
    return latestForKind<T>(kind, next);
  };

  const supersede = update;

  return {
    save,
    update,
    supersede,
    isSaving: mutation.isLoading,
    saveError: mutation.error,
    resetSave: mutation.reset,
  };
}

function latestForKind<T>(kind: string, payload: CompanyRulesPayload): T {
  const list =
    kind === "scope-templates"
      ? payload.scopeTemplates
      : kind === "material-rules"
        ? payload.materialRules
        : kind === "labor-rules"
          ? payload.laborRules
          : kind === "pricing-strategy"
            ? payload.pricingStrategies
            : kind === "supplier-rules"
              ? payload.supplierRules
              : payload.unitRules;
  return list[0] as T;
}

export function useCheckRuleUsage() {
  return {
    checkUsage: useCallback(async (ruleId: string) => {
      void ruleId;
      return { in_use: false };
    }, []),
  };
}

export function useScopeTemplates() {
  const { data, isLoading, error, refetch } = useCompanyRulesData();
  const actions = useRuleMutation<ScopeTemplate>("scope-templates", refetch);
  return {
    templates: data.scopeTemplates,
    isLoading,
    error,
    refetch,
    ...actions,
  };
}

export function useMaterialRules() {
  const { data, isLoading, error, refetch } = useCompanyRulesData();
  const actions = useRuleMutation<MaterialRuleEntry>("material-rules", refetch);
  return {
    rules: data.materialRules,
    isLoading,
    error,
    refetch,
    ...actions,
  };
}

export function useLaborTradeOptions() {
  return {
    options: ["Mason", "Carpenter", "Painter", "Welder", "Electrician", "Plumber"],
  };
}

export function useLaborRules() {
  const { data, isLoading, error, refetch } = useCompanyRulesData();
  const actions = useRuleMutation<LaborRule>("labor-rules", refetch);
  return {
    rules: data.laborRules,
    isLoading,
    error,
    refetch,
    ...actions,
  };
}

export function usePricingStrategies() {
  const { data, isLoading, error, refetch } = useCompanyRulesData();
  const actions = useRuleMutation<PricingStrategyRule>("pricing-strategy", refetch);
  return {
    strategies: data.pricingStrategies,
    isLoading,
    error,
    refetch,
    ...actions,
  };
}

export function useUnitRules() {
  const { data, isLoading, error, refetch } = useCompanyRulesData();
  const actions = useRuleMutation<UnitRule>("unit-rules", refetch);
  return {
    rules: data.unitRules,
    isLoading,
    error,
    refetch,
    ...actions,
  };
}

export function useSupplierRules() {
  const { data, isLoading, error, refetch } = useCompanyRulesData();
  const saveMutation = useMutation<CompanyRulesPayload>();
  const updateMutation = useMutation<CompanyRulesPayload>();
  const deactivateMutation = useMutation<CompanyRulesPayload>();

  return {
    rules: data.supplierRules ?? [],
    isLoading,
    error,
    refetch,
    save: async (payload: Omit<SupplierRuleEntry, "rule_id">) => {
      const next = await saveMutation.mutate("/api/company-rules/supplier-rules", payload, "POST");
      window.dispatchEvent(new CustomEvent("buildsmart:company-rules-changed", { detail: { kind: "supplier-rules" } }));
      refetch();
      return latestForKind<SupplierRuleEntry>("supplier-rules", next);
    },
    isSaving: saveMutation.isLoading,
    saveError: saveMutation.error,
    resetSave: saveMutation.reset,
    update: async (ruleId: string, payload: Partial<SupplierRuleEntry>) => {
      const next = await updateMutation.mutate(`/api/company-rules/supplier-rules/${ruleId}`, payload, "PATCH");
      window.dispatchEvent(new CustomEvent("buildsmart:company-rules-changed", { detail: { kind: "supplier-rules" } }));
      refetch();
      return latestForKind<SupplierRuleEntry>("supplier-rules", next);
    },
    isUpdating: updateMutation.isLoading,
    updateError: updateMutation.error,
    resetUpdate: updateMutation.reset,
    deactivate: async (ruleId: string) => {
      const next = await deactivateMutation.mutate(`/api/company-rules/supplier-rules/${ruleId}`, undefined, "DELETE");
      window.dispatchEvent(new CustomEvent("buildsmart:company-rules-changed", { detail: { kind: "supplier-rules" } }));
      refetch();
      return latestForKind<SupplierRuleEntry>("supplier-rules", next);
    },
    isDeactivating: deactivateMutation.isLoading,
    deactivateError: deactivateMutation.error,
  };
}

export function useExistingRules() {
  const { data, isLoading, error, refetch } = useCompanyRulesData();
  const disableMutation = useMutation<CompanyRulesPayload>();

  return {
    rules: data.existingRules,
    isLoading,
    error,
    refetch,
    checkUsage: async (ruleId: string) => {
      void ruleId;
      return { in_use: false };
    },
    isCheckingUsage: false,
    disable: async (ruleId: string) => {
      const kind = data.existingRules.find((rule) => rule.rule_id === ruleId)?.rule_kind;
      const routeKind =
        kind === "scope-template"
          ? "scope-templates"
          : kind === "material-rule"
            ? "material-rules"
            : kind === "supplier-rule"
              ? "supplier-rules"
              : kind === "labor-rule"
                ? "labor-rules"
                : kind === "pricing-strategy"
                  ? "pricing-strategy"
                  : "unit-rules";
      await disableMutation.mutate(`/api/company-rules/${routeKind}/${ruleId}`, undefined, "DELETE");
      window.dispatchEvent(new CustomEvent("buildsmart:company-rules-changed", { detail: { kind: routeKind } }));
      refetch();
    },
    isDisabling: disableMutation.isLoading,
    disableError: disableMutation.error,
  };
}
