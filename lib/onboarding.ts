export function resolveOnboardingRoute(step: number): string {
  if (step <= 0) return "/onboarding/pricelist";
  if (step === 1) return "/onboarding/preferences";
  return "/dashboard";
}
