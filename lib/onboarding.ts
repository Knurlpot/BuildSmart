export function resolveOnboardingRoute(step: number): string {
  if (step <= 0) return "/onboarding/pricelist";
  if (step === 1) return "/onboarding/preferences";
  return "/dashboard";
}

// Part D — advances onboarding to `targetStep` iff the user is still behind it. Safe to
// call from multiple places / on every render of a component that just observed the
// qualifying action: a no-op once the user is already at or past the target step, so it
// never double-fires or regresses a further-along user.
export async function advanceOnboardingStep(
  currentStep: number,
  targetStep: number,
  updateOnboardingStep: (step: number) => Promise<void>
): Promise<void> {
  if (currentStep < targetStep) {
    await updateOnboardingStep(targetStep);
  }
}

// Part D — Step 0 -> 1 gate: "at least one Pricelist action" is checked against REAL
// catalog state (does the company have any saved price records at all), not a
// session-only flag — so work completed in an earlier session, or before this gate
// existed, is still correctly recognized on the next visit. A PSA index load alone does
// NOT satisfy this: PSA is explicitly analytics-only and writes nothing to either
// catalog (see hooks/usePricelistPublishedSource.ts), so it has no persisted state to
// check here — only a Supplier upload commit or a DPWH fetch actually produces catalog
// records.
export interface PricelistCompletionState {
  uploadCatalogCount: number;
  dpwhCatalogCount: number;
}

export function hasCompletedPricelistStep(state: PricelistCompletionState): boolean {
  return state.uploadCatalogCount > 0 || state.dpwhCatalogCount > 0;
}

// Part D — Step 1 -> 2 gate.
// ⚠️ DECISION NEEDED — flagged for human review. Defaulting to: at least one Pricing
// Strategy rule saved. Rationale: pricing strategy (markup/overhead/profit margin/VAT) is
// the one rule type that actually determines a quote's numbers — without it a quote
// can't be priced. Requiring all six rule types would trap users who legitimately don't
// use some of them (e.g. a specialty subcontractor who never uses Scope Templates).
// This is the ONLY place that decision is encoded — change just this function's body
// (e.g. to also require Scope Templates, or a count threshold) if the team decides
// differently; every call site passes in the same CompanyRulesCompletionState shape
// regardless of what the function ends up checking.
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
