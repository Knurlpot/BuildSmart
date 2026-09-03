import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { QuotationDetailView } from "./QuotationDetailView";

export default async function QuotationDetailPage({ params }: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await params;
  return (
    <RequireOnboardingStep minStep={2}>
      <QuotationDetailView quotationId={quotationId} />
    </RequireOnboardingStep>
  );
}
