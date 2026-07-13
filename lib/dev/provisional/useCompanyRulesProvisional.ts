// PROVISIONAL — shape pending backend confirmation.
//
// Assumed endpoints below (ALL unconfirmed — path, method, and payload shape are guesses
// for review purposes only, not a committed contract), now keyed to the v5 company_rule
// envelope (a real int rule_id is the shared spine across every rule type):
//   GET   /api/company-rules/scope-templates              -> ScopeTemplate[]
//   POST  /api/company-rules/scope-templates/new          -> ScopeTemplate
//   PATCH /api/company-rules/scope-templates/:id          -> ScopeTemplate   (edit in place)
//   POST  /api/company-rules/scope-templates/:id/supersede -> ScopeTemplate  (new version)
//   ...same four for material-rules, labor-rules, pricing-strategies, unit-rules.
//   GET  /api/company-rules/existing                    -> ExistingRuleSummary[]
//   POST /api/company-rules/existing/:id/check-usage    -> { in_use: boolean }
//   POST /api/company-rules/existing/:id/disable        -> { disabled: boolean }
//   GET  /api/company-rules/labor-trades                -> string[]
//        PROVISIONAL representative data (not a confirmed lookup) — fetched through
//        useFetch/mockFetch like everything else here, specifically so it goes through the
//        dev-mock production-safety gate. A component-level static import of the fixture
//        would leak this string data into the production bundle even though nothing
//        "renders" it directly — empirically confirmed the hard way (grepped an actual
//        `next build` output and found fixture strings in .next/server and .next/static
//        before this fix).
//
// check-usage/disable are intentionally the ONE pair of endpoints shared across every rule
// type (keyed only by rule_id, not by resource path) — v5's company_rule envelope makes
// rule_id a universal spine id, so a real backend only needs one such pair regardless of
// rule_category. update/supersede, by contrast, ARE resource-scoped: each rule type still
// has its own detail table (rule_material, rule_labor, ...), so the payload shape differs
// per type even though the mechanics (check usage, then edit-in-place or supersede) don't.
//
// These reuse the same generic useFetch/useMutation primitives every other page in this
// app uses — that's shared infrastructure, not a schema commitment. What's provisional is
// the PAYLOAD SHAPE (companyRulesTypes.ts) and the endpoint paths themselves. No
// fabricated success anywhere: every mutate surfaces real error state from useMutation.
import { useFetch } from '@/hooks/useFetch';
import { useMutation } from '@/hooks/useMutation';
import type {
  ExistingRuleSummary,
  LaborRule,
  MaterialRuleEntry,
  PricingStrategyRule,
  ScopeTemplate,
  UnitRule,
} from './companyRulesTypes';

/** Client-side staging key generator — NEVER a real id, never sent expecting the backend to honor it. */
export function stagingId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Shared create/update/supersede mutation surface for one rule-type resource path — see
 * the file header for why these three (plus the shared check-usage below) are the whole
 * set any rule-editing form needs, regardless of which detail table it maps to.
 */
function useRuleMutations<T>(basePath: string) {
  const create = useMutation<T>();
  const update = useMutation<T>();
  const supersede = useMutation<T>();
  return {
    create: (payload: unknown) => create.mutate(`${basePath}/new`, payload, 'POST'),
    isCreating: create.isLoading,
    createError: create.error,
    resetCreate: create.reset,
    update: (ruleId: string, payload: unknown) => update.mutate(`${basePath}/${ruleId}`, payload, 'PATCH'),
    isUpdating: update.isLoading,
    updateError: update.error,
    resetUpdate: update.reset,
    supersede: (ruleId: string, payload: unknown) => supersede.mutate(`${basePath}/${ruleId}/supersede`, payload, 'POST'),
    isSuperseding: supersede.isLoading,
    supersedeError: supersede.error,
    resetSupersede: supersede.reset,
  };
}

/** Shared by every rule type's edit flow (Part D) AND ManageExistingRulesTab's disable flow. */
export function useCheckRuleUsage() {
  const mutation = useMutation<{ in_use: boolean }>();
  return {
    checkUsage: (ruleId: string) => mutation.mutate(`/api/company-rules/existing/${ruleId}/check-usage`, {}, 'POST'),
    isCheckingUsage: mutation.isLoading,
    checkUsageError: mutation.error,
  };
}

export function useScopeTemplates() {
  const { data, isLoading, error, refetch } = useFetch<ScopeTemplate[]>('/api/company-rules/scope-templates');
  const m = useRuleMutations<ScopeTemplate>('/api/company-rules/scope-templates');
  return {
    templates: data ?? [],
    isLoading,
    error,
    refetch,
    save: (payload: Omit<ScopeTemplate, 'rule_id' | 'is_active' | 'effective_date'>) => m.create(payload),
    isSaving: m.isCreating,
    saveError: m.createError,
    resetSave: m.resetCreate,
    update: m.update,
    isUpdating: m.isUpdating,
    updateError: m.updateError,
    resetUpdate: m.resetUpdate,
    supersede: m.supersede,
    isSuperseding: m.isSuperseding,
    supersedeError: m.supersedeError,
    resetSupersede: m.resetSupersede,
  };
}

export function useMaterialRules() {
  const { data, isLoading, error, refetch } = useFetch<MaterialRuleEntry[]>('/api/company-rules/material-rules');
  const m = useRuleMutations<MaterialRuleEntry>('/api/company-rules/material-rules');
  return {
    rules: data ?? [],
    isLoading,
    error,
    refetch,
    save: (payload: Omit<MaterialRuleEntry, 'rule_id' | 'is_active' | 'effective_date'>) => m.create(payload),
    isSaving: m.isCreating,
    saveError: m.createError,
    resetSave: m.resetCreate,
    update: m.update,
    isUpdating: m.isUpdating,
    updateError: m.updateError,
    resetUpdate: m.resetUpdate,
    supersede: m.supersede,
    isSuperseding: m.isSuperseding,
    supersedeError: m.supersedeError,
    resetSupersede: m.resetSupersede,
  };
}

export function useLaborRules() {
  const { data, isLoading, error, refetch } = useFetch<LaborRule[]>('/api/company-rules/labor-rules');
  const m = useRuleMutations<LaborRule>('/api/company-rules/labor-rules');
  return {
    rules: data ?? [],
    isLoading,
    error,
    refetch,
    save: (payload: Omit<LaborRule, 'rule_id' | 'is_active' | 'effective_date'>) => m.create(payload),
    isSaving: m.isCreating,
    saveError: m.createError,
    resetSave: m.resetCreate,
    update: m.update,
    isUpdating: m.isUpdating,
    updateError: m.updateError,
    resetUpdate: m.resetUpdate,
    supersede: m.supersede,
    isSuperseding: m.isSuperseding,
    supersedeError: m.supersedeError,
    resetSupersede: m.resetSupersede,
  };
}

export function usePricingStrategies() {
  const { data, isLoading, error, refetch } = useFetch<PricingStrategyRule[]>('/api/company-rules/pricing-strategies');
  const m = useRuleMutations<PricingStrategyRule>('/api/company-rules/pricing-strategies');
  return {
    strategies: data ?? [],
    isLoading,
    error,
    refetch,
    save: (payload: Omit<PricingStrategyRule, 'rule_id' | 'is_active' | 'effective_date'>) => m.create(payload),
    isSaving: m.isCreating,
    saveError: m.createError,
    resetSave: m.resetCreate,
    update: m.update,
    isUpdating: m.isUpdating,
    updateError: m.updateError,
    resetUpdate: m.resetUpdate,
    supersede: m.supersede,
    isSuperseding: m.isSuperseding,
    supersedeError: m.supersedeError,
    resetSupersede: m.resetSupersede,
  };
}

export function useUnitRules() {
  const { data, isLoading, error, refetch } = useFetch<UnitRule[]>('/api/company-rules/unit-rules');
  const m = useRuleMutations<UnitRule>('/api/company-rules/unit-rules');
  return {
    rules: data ?? [],
    isLoading,
    error,
    refetch,
    save: (payload: Omit<UnitRule, 'rule_id' | 'is_active' | 'effective_date'>) => m.create(payload),
    isSaving: m.isCreating,
    saveError: m.createError,
    resetSave: m.resetCreate,
    update: m.update,
    isUpdating: m.isUpdating,
    updateError: m.updateError,
    resetUpdate: m.resetUpdate,
    supersede: m.supersede,
    isSuperseding: m.isSuperseding,
    supersedeError: m.supersedeError,
    resetSupersede: m.resetSupersede,
  };
}

export function useLaborTradeOptions() {
  const { data, isLoading, error } = useFetch<string[]>('/api/company-rules/labor-trades');
  return { options: data ?? [], isLoading, error };
}

export function useExistingRules() {
  const { data, isLoading, error, refetch } = useFetch<ExistingRuleSummary[]>('/api/company-rules/existing');
  const { checkUsage, isCheckingUsage, checkUsageError } = useCheckRuleUsage();
  const disable = useMutation<{ disabled: boolean }>();
  return {
    rules: data ?? [],
    isLoading,
    error,
    refetch,
    checkUsage,
    isCheckingUsage,
    checkUsageError,
    disable: (ruleId: string) => disable.mutate(`/api/company-rules/existing/${ruleId}/disable`, {}, 'POST'),
    isDisabling: disable.isLoading,
    disableError: disable.error,
  };
}
