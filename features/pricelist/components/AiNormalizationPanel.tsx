"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  File as FileIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { usePricelistNormalization, type QueueItem } from "@/hooks/usePricelistNormalization";

const SOURCES = ["DPWH", "PSA", "Supplier", "Internal"] as const;
// Backend support confirmed for all three: pricelist_parser.py handles
// CSV/XLSX via pandas and PDF via pdfplumber (requires an actual ruled table
// in the PDF, not OCR/scanned images).
const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".pdf"];

function fmt(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function QueueItemRow({ item }: { item: QueueItem }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm">
      <FileIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-800">{item.file.name}</p>
        {item.status === "queued" && <p className="text-xs text-gray-400">Queued</p>}
        {(item.status === "uploading" || item.status === "pending" || item.status === "processing") && (
          <p className="flex items-center gap-1.5 text-xs text-indigo-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            {item.status === "uploading" && "Uploading…"}
            {item.status === "pending" && "Waiting to start…"}
            {item.status === "processing" &&
              (item.useAi ? "Normalizing via AI Match (rate-limited, can take a while)…" : "Normalizing…")}
          </p>
        )}
        {item.status === "done" && item.result && (
          <p className="text-xs text-green-700">
            Processed {item.result.processed} — {item.result.matched} matched, {item.result.new_items_created} new,{" "}
            {item.result.needs_review} flagged for review.
          </p>
        )}
        {item.status === "failed" && (
          <p className="text-xs text-red-600">{item.failureReason || "Failed — check the backend logs."}</p>
        )}
      </div>
      <div className="mt-0.5 shrink-0">
        {item.status === "queued" && <Clock className="h-4 w-4 text-gray-300" />}
        {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {item.status === "failed" && <AlertTriangle className="h-4 w-4 text-red-500" />}
      </div>
    </div>
  );
}

/**
 * Exercises the FastAPI normalization pipeline (POST /pricelist/upload -> poll
 * GET /pricelist/status/{id} -> GET /pricelist/review) directly. Separate from
 * UploadPricelistTab/RowReviewStep, which serve the existing manual
 * column-mapping upload flow against a different (not yet built) backend
 * contract — see the Step 7 gap report for why these aren't merged.
 */
export function AiNormalizationPanel() {
  const { queue, enqueueFiles, clearFinishedQueueItems, reviewItems, isLoadingReview, reviewError, refetchReview } =
    usePricelistNormalization();

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileTypeError, setFileTypeError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState<(typeof SOURCES)[number]>("Supplier");
  // Defaults to the instant local matcher rather than the AI path — safer
  // default given how rate-limited/quota-constrained the AI path can be.
  const [useAi, setUseAi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const acceptFiles = (candidates: FileList | File[]) => {
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const candidate of Array.from(candidates)) {
      const ext = "." + (candidate.name.split(".").pop() ?? "").toLowerCase();
      if (ACCEPTED_EXTENSIONS.includes(ext)) {
        accepted.push(candidate);
      } else {
        rejected.push(candidate.name);
      }
    }

    if (rejected.length > 0) {
      setFileTypeError(`Skipped unsupported file(s): ${rejected.join(", ")} — accepts CSV, XLSX, or PDF.`);
    } else {
      setFileTypeError(null);
    }
    if (accepted.length > 0) {
      setPendingFiles((prev) => [...prev, ...accepted]);
    }
  };

  const removePendingFile = (name: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleUpload = () => {
    if (pendingFiles.length === 0) return;
    enqueueFiles(pendingFiles, source, useAi);
    setPendingFiles([]);
  };

  const isQueueBusy = queue.some((item) =>
    ["queued", "uploading", "pending", "processing"].includes(item.status)
  );
  const hasFinishedItems = queue.some((item) => item.status === "done" || item.status === "failed");

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="mb-1 text-sm font-bold text-gray-900">AI Material Normalization (pipeline test)</p>
        <p className="mb-4 text-xs text-gray-500">
          Uploads raw price lists to the FastAPI normalization service, which auto-matches each row against
          the existing item catalog by name/unit similarity. Multiple files are queued and processed one at a
          time.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Files</label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files.length > 0) acceptFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-sm transition ${
                dragging
                  ? "border-primary bg-orange-50/30"
                  : "border-gray-200 bg-gray-50 hover:border-primary hover:bg-orange-50/20"
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS.join(",")}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) acceptFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-1 items-center gap-2 text-gray-400">
                <UploadCloud className="h-4 w-4 shrink-0" />
                <span>Drag &amp; drop one or more files, or click to browse — CSV, XLSX, or PDF</span>
              </div>
            </div>
            {fileTypeError && <p className="text-xs text-red-500">{fileTypeError}</p>}
            {pendingFiles.length > 0 && (
              <div className="flex flex-col gap-1 rounded-xl border border-gray-100 bg-gray-50 p-2">
                {pendingFiles.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 px-1.5 py-1 text-sm">
                    <FileIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="flex-1 truncate text-gray-700">{f.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePendingFile(f.name);
                      }}
                      className="shrink-0 rounded p-1 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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

        <div className="mt-4 flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Matching Mode</label>
          <div className="flex w-fit gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setUseAi(false)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                !useAi ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Zap className="h-3.5 w-3.5" /> Quick Match
            </button>
            <button
              type="button"
              onClick={() => setUseAi(true)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                useAi ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" /> AI Match
            </button>
          </div>
          <p className="text-xs text-gray-400">
            {useAi
              ? "Uses Gemini to classify each row — smarter on typos/abbreviations, but slower and rate-limited (~15-20s per row). Applies to files queued from now on, not ones already processing."
              : "Compares names instantly using text similarity — free and fast, best for clean/consistent data."}
          </p>
        </div>

        <button
          type="button"
          disabled={pendingFiles.length === 0}
          onClick={handleUpload}
          className="mt-4 flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {pendingFiles.length > 1
            ? `Upload & Normalize ${pendingFiles.length} Files`
            : "Upload & Normalize"}
        </button>

        {/* The status endpoint only ever returns {status, result} — no per-row
            progress (e.g. "row 4 of 10"). Showing that would need the Celery
            task to report intermediate state (task.update_state with a
            {current, total} meta dict, via a bound task) and the router to
            surface it while state is STARTED/PROGRESS. Not implemented here —
            this is an explanation of *why* it's slow, not a fabricated
            progress bar. */}
        {queue.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Queue {isQueueBusy && "— processing…"}
              </p>
              {hasFinishedItems && !isQueueBusy && (
                <button
                  type="button"
                  onClick={clearFinishedQueueItems}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600"
                >
                  <Trash2 className="h-3 w-3" /> Clear finished
                </button>
              )}
            </div>
            {queue.map((item) => (
              <QueueItemRow key={item.id} item={item} />
            ))}
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
