import { FileSpreadsheet, ListChecks } from "lucide-react";

// Describes AiNormalizationPanel's actual pipeline (FastAPI /pricelist/upload
// -> Celery normalize_price_list task) — keep this in sync with that flow,
// not with the separate (unwired) UploadPricelistTab/usePricelistUpload one.
export function QuickUploadGuide() {
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-sm font-bold text-gray-800">Quick Upload Guide</p>

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E07B3918]">
            <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
          </div>
          <p className="text-xs font-bold text-gray-700">Accepted formats</p>
        </div>
        <div className="flex gap-1.5">
          {["CSV", "XLSX", "PDF"].map((f) => (
            <span
              key={f}
              className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold text-gray-600"
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4f46e518]">
            <ListChecks className="h-3.5 w-3.5 text-[#4f46e5]" />
          </div>
          <p className="text-xs font-bold text-gray-700">What happens</p>
        </div>
        <p className="text-xs leading-relaxed text-gray-500">
          Each file is queued and processed on its own. The backend auto-detects the material
          name, unit, and price columns. If it cannot, you&apos;ll be asked to map them by
          hand. Every row is then matched against your existing catalog: confident matches save
          immediately, and anything uncertain lands in Pending Review below for you to confirm,
          correct, or reject.
        </p>
      </div>
    </div>
  );
}
