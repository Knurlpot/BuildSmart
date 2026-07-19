"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Upload } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { usePricelistNormalization } from "@/hooks/usePricelistNormalization";

const SOURCES = ["DPWH", "PSA", "Supplier", "Internal"] as const;

function fmt(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

/**
 * Exercises the FastAPI normalization pipeline (POST /pricelist/upload -> poll
 * GET /pricelist/status/{id} -> GET /pricelist/review) directly. Separate from
 * UploadPricelistTab/RowReviewStep, which serve the existing manual
 * column-mapping upload flow against a different (not yet built) backend
 * contract — see the Step 7 gap report for why these aren't merged.
 */
export function AiNormalizationPanel() {
  const {
    uploadFile,
    isUploading,
    uploadError,
    taskStatus,
    result,
    pollError,
    reviewItems,
    isLoadingReview,
    reviewError,
    refetchReview,
  } = usePricelistNormalization();

  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<(typeof SOURCES)[number]>("Supplier");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    if (!file) return;
    uploadFile(file, source).catch(() => {});
  };

  const isBusy = taskStatus === "pending" || taskStatus === "processing";

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="mb-1 text-sm font-bold text-gray-900">AI Material Normalization (pipeline test)</p>
        <p className="mb-4 text-xs text-gray-500">
          Uploads a raw price list to the FastAPI normalization service, which auto-matches each
          row against the existing item catalog by name/unit similarity.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">File</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as (typeof SOURCES)[number])}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
            >
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          disabled={!file || isUploading || isBusy}
          onClick={handleUpload}
          className="mt-4 flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
        >
          {isUploading || isBusy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> {isUploading ? "Uploading…" : "Processing…"}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Upload &amp; Normalize
            </>
          )}
        </button>

        {uploadError && (
          <p className="mt-3 text-sm text-red-600">Couldn&apos;t start the upload: {uploadError.message}</p>
        )}
        {pollError && (
          <p className="mt-3 text-sm text-red-600">Couldn&apos;t check task status: {pollError.message}</p>
        )}

        {taskStatus === "done" && result && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Processed {result.processed} rows — {result.matched} matched, {result.new_items_created} new
              item{result.new_items_created === 1 ? "" : "s"} created, {result.needs_review} flagged for
              review.
            </span>
          </div>
        )}
        {taskStatus === "failed" && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>The normalization task failed. Check the backend logs for details.</span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">Pending Review</p>
            <p className="text-xs text-gray-500">
              Low-confidence matches awaiting a decision. Approve/reject actions aren&apos;t wired up yet —
              this is read-only.
            </p>
          </div>
          <button
            type="button"
            onClick={refetchReview}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        <QueryState
          isLoading={isLoadingReview}
          error={reviewError}
          isEmpty={reviewItems.length === 0}
          onRetry={refetchReview}
          emptyTitle="No items awaiting review"
          emptyHint="Rows the matcher isn't confident about will show up here after an upload."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-4">Raw Name</th>
                  <th className="py-2 pr-4">Unit</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">Confidence</th>
                  <th className="py-2 pr-4">Suggested Category</th>
                  <th className="py-2 pr-4">Suggested Material</th>
                  <th className="py-2 pr-4">Suggested Brand</th>
                  <th className="py-2 pr-4">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reviewItems.map((item) => (
                  <tr key={item.review_id}>
                    <td className="py-2 pr-4 font-medium text-gray-800">{item.raw_name}</td>
                    <td className="py-2 pr-4 text-gray-500">{item.raw_unit}</td>
                    <td className="py-2 pr-4 text-gray-500">{fmt(item.raw_price)}</td>
                    <td className="py-2 pr-4 text-gray-500">{(item.confidence * 100).toFixed(0)}%</td>
                    <td className="py-2 pr-4 text-gray-500">{item.suggested_category_type ?? "—"}</td>
                    <td className="py-2 pr-4 text-gray-500">{item.suggested_material ?? "—"}</td>
                    <td className="py-2 pr-4 text-gray-500">{item.suggested_brand ?? "—"}</td>
                    <td className="py-2 pr-4 text-gray-500">{item.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </div>
    </div>
  );
}
