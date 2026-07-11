import { FileSpreadsheet, ListChecks } from "lucide-react";

// Confirmed behavior ONLY. Do not add: mixed-supplier support, spike detection,
// re-upload/price-update behavior, dedup/auto-matching, messy-file handling, confidence
// scoring, or a "recommended structure" claim — none of that is confirmed to exist yet.
export function QuickUploadGuide() {
  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5">
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
          You can select multiple files at once — for example, an item pricelist plus a
          separate supplier info file. After you confirm, the system extracts the rows and
          shows you the detected columns to map to BuildSmart&apos;s item and supplier fields.
          You then review and confirm the rows before anything saves — nothing is written to
          your catalog until you approve.
        </p>
      </div>
    </div>
  );
}
