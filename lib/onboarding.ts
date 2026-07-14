export function resolveOnboardingRoute(step: number): string {
  if (step <= 0) return "/onboarding/pricelist";
  if (step === 1) return "/onboarding/preferences";
  return "/dashboard";
}

export async function advanceOnboardingStep(
  currentStep: number,
  targetStep: number,
  updateOnboardingStep: (step: number) => Promise<void>
): Promise<void> {
  if (currentStep < targetStep) {
    await updateOnboardingStep(targetStep);
  }
}

export interface PricelistCompletionState {
  uploadCatalogCount: number;
  dpwhCatalogCount: number;
}

export function hasCompletedPricelistStep(state: PricelistCompletionState): boolean {
  return state.uploadCatalogCount > 0 || state.dpwhCatalogCount > 0;
}


export interface CompanyRulesCompletionState {
  scopeTemplateCount: number;
  materialRuleCount: number;
  laborRuleCount: number;
  pricingStrategyCount: number;
  unitRuleCount: number;
}

export function hasCompletedCompanyRulesStep(state: CompanyRulesCompletionState): boolean {
  return state.pricingStrategyCount > 0;
}