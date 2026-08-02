import { QuotationDetailView } from "./QuotationDetailView";

export default async function QuotationDetailPage({ params }: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await params;
  return <QuotationDetailView quotationId={quotationId} />;
}
