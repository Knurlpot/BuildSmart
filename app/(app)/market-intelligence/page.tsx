import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { PriceTrendsPanel } from "@/components/market-intelligence/PriceTrendsPanel";

export default function MarketIntelligencePage() {
  return (
    <RequireOnboardingStep minStep={2}>
      <PriceTrendsPanel />
    </RequireOnboardingStep>
  );
}
