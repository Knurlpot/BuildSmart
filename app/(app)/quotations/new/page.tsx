import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { QuotationGenerationWizard } from "@/features/quotation-generation";

export default function NewQuotationPage() {
  return (
    <RequireOnboardingStep minStep={2}>
      <QuotationGenerationWizard />
    </RequireOnboardingStep>
  );
}