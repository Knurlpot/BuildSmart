import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { CompanyRulesShell } from "@/features/company-rules/components";

export default function ManagementPage() {
  return (
    <RequireOnboardingStep minStep={1}>
      <CompanyRulesShell />
    </RequireOnboardingStep>
  );
}
