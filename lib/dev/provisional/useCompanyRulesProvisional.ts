// PROVISIONAL — shape pending backend schema decision, do not treat as final.
//
// Assumed endpoints below (ALL unconfirmed — path, method, and payload shape are guesses
// for review purposes only, not a committed contract). Create endpoints use a distinct
// `/new` suffix rather than POSTing the same path as the GET list: this dev-mock resolver
// matches purely by pathname (see lib/dev/mockFetch.ts), not HTTP method, so a real GET and
// POST sharing one path would collide in mock mode — kept distinct here to avoid that, not
// necessarily how the real REST contract will look once the backend decides.
//   GET  /api/company-rules/scope-templates          -> ScopeTemplate[]
//   POST /api/company-rules/scope-templates/new       -> ScopeTemplate
//   GET  /api/company-rules/material-rules             -> MaterialRuleEntry[]
//   POST /api/company-rules/material-rules/new         -> MaterialRuleEntry
//   GET  /api/company-rules/labor-rules                -> LaborRule[]
//   POST /api/company-rules/labor-rules/new             -> LaborRule
//   GET  /api/company-rules/pricing-strategies          -> PricingStrategyRule[]
//   POST /api/company-rules/pricing-strategies/new       -> PricingStrategyRule
//   GET  /api/company-rules/unit-rules                  -> UnitRule[]
//   POST /api/company-rules/unit-rules/new               -> UnitRule
//   GET  /api/company-rules/existing                    -> ExistingRuleSummary[]
//   POST /api/company-rules/existing/:id/check-usage    -> { in_use: boolean }
//   POST /api/company-rules/existing/:id/disable        -> { disabled: boolean }
//   GET  /api/company-rules/labor-trades                -> string[]
//   GET  /api/company-rules/materials-by-category        -> Record<CategoryType, string[]>
//        Both option lists are PROVISIONAL representative data (not a confirmed lookup) —
//        fetched through useFetch/mockFetch like everything else here, specifically so
//        they go through the dev-mock production-safety gate. A component-level static
//        import of the fixture would leak this string data into the production bundle
//        even though nothing "renders" it directly — empirically confirmed the hard way
//        (grepped an actual `next build` output and found fixture strings in
//        .next/server and .next/static before this fix).
//
// These reuse the same generic useFetch/useMutation primitives every other page in this
// app uses — that's shared infrastructure, not a schema commitment. What's provisional is
// the PAYLOAD SHAPE (companyRulesTypes.ts) and the endpoint paths themselves, not the
// fetch/mutate mechanics. No fabricated success anywhere: `save`/`disable` surface real
// error state from useMutation, same as every confirmed hook in hooks/.
import { useFetch } from '@/hooks/useFetch';
import { useMutation } from '@/hooks/useMutation';
import type { CategoryType } from '@/types/entities/category';
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

export function useScopeTemplates() {
  const { data, isLoading, error, refetch } = useFetch<ScopeTemplate[]>('/api/company-rules/scope-templates');
  const save = useMutation<ScopeTemplate>();
  return {
    templates: data ?? [],
    isLoading,
    error,
    refetch,
    save: (payload: Omit<ScopeTemplate, 'scope_template_id' | 'status'>) =>
      save.mutate('/api/company-rules/scope-templates/new', payload, 'POST'),
    isSaving: save.isLoading,
    saveError: save.error,
    saveResult: save.data,
    resetSave: save.reset,
  };
}

export function useMaterialRules() {
  const { data, isLoading, error, refetch } = useFetch<MaterialRuleEntry[]>('/api/company-rules/material-rules');
  const save = useMutation<MaterialRuleEntry>();
  return {
    rules: data ?? [],
    isLoading,
    error,
    refetch,
    save: (payload: Omit<MaterialRuleEntry, 'material_rule_id'>) =>
      save.mutate('/api/company-rules/material-rules/new', payload, 'POST'),
    isSaving: save.isLoading,
    saveError: save.error,
    saveResult: save.data,
    resetSave: save.reset,
  };
}

export function useLaborRules() {
  const { data, isLoading, error, refetch } = useFetch<LaborRule[]>('/api/company-rules/labor-rules');
  const save = useMutation<LaborRule>();
  return {
    rules: data ?? [],
    isLoading,
    error,
    refetch,
    save: (payload: Omit<LaborRule, 'labor_rule_id' | 'status'>) =>
      save.mutate('/api/company-rules/labor-rules/new', payload, 'POST'),
    isSaving: save.isLoading,
    saveError: save.error,
    saveResult: save.data,
    resetSave: save.reset,
  };
}

export function usePricingStrategies() {
  const { data, isLoading, error, refetch } = useFetch<PricingStrategyRule[]>('/api/company-rules/pricing-strategies');
  const save = useMutation<PricingStrategyRule>();
  return {
    strategies: data ?? [],
    isLoading,
    error,
    refetch,
    save: (payload: Omit<PricingStrategyRule, 'pricing_strategy_id' | 'status'>) =>
      save.mutate('/api/company-rules/pricing-strategies/new', payload, 'POST'),
    isSaving: save.isLoading,
    saveError: save.error,
    saveResult: save.data,
    resetSave: save.reset,
  };
}

export function useUnitRules() {
  const { data, isLoading, error, refetch } = useFetch<UnitRule[]>('/api/company-rules/unit-rules');
  const save = useMutation<UnitRule>();
  return {
    rules: data ?? [],
    isLoading,
    error,
    refetch,
    save: (payload: Omit<UnitRule, 'unit_rule_id' | 'status'>) =>
      save.mutate('/api/company-rules/unit-rules/new', payload, 'POST'),
    isSaving: save.isLoading,
    saveError: save.error,
    saveResult: save.data,
    resetSave: save.reset,
  };
}

export function useLaborTradeOptions() {
  const { data, isLoading, error } = useFetch<string[]>('/api/company-rules/labor-trades');
  return { options: data ?? [], isLoading, error };
}

export function useMaterialsByCategory() {
  const { data, isLoading, error } = useFetch<Record<CategoryType, string[]>>('/api/company-rules/materials-by-category');
  return { materialsByCategory: data, isLoading, error };
}

export function useExistingRules() {
  const { data, isLoading, error, refetch } = useFetch<ExistingRuleSummary[]>('/api/company-rules/existing');
  const checkUsage = useMutation<{ in_use: boolean }>();
  const disable = useMutation<{ disabled: boolean }>();
  return {
    rules: data ?? [],
    isLoading,
    error,
    refetch,
    checkUsage: (ruleId: string) => checkUsage.mutate(`/api/company-rules/existing/${ruleId}/check-usage`, {}, 'POST'),
    isCheckingUsage: checkUsage.isLoading,
    checkUsageError: checkUsage.error,
    disable: (ruleId: string) => disable.mutate(`/api/company-rules/existing/${ruleId}/disable`, {}, 'POST'),
    isDisabling: disable.isLoading,
    disableError: disable.error,
  };
}
