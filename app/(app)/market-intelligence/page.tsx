import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";

export default function MarketIntelligencePage() {
  return (
    <RequireOnboardingStep minStep={2}>
      <p className="text-sm text-gray-400">Coming soon.</p>
    </RequireOnboardingStep>
  );
}
