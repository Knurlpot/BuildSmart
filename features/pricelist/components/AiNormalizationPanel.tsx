"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  File as FileIcon,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { ColumnMappingStep, type DetectedColumn } from "./ColumnMappingStep";
import { QuickUploadGuide } from "./QuickUploadGuide";
import {
  NORMALIZATION_FIELD_LABELS,
  usePricelistNormalization,
  type NormalizationField,
  type PricelistReviewItem,
  type PricelistReviewItemUpdate,
  type QueueItem,
} from "@/hooks/usePricelistNormalization";

const NORMALIZATION_FIELDS: NormalizationField[] = ["raw_name", "raw_unit", "raw_price"];

const SOURCES = ["DPWH", "PSA", "Supplier", "Internal"] as const;
const CATEGORIES = [
  "Uncategorized",
  "Concrete & Masonry",
  "Steel & Metals",
  "Plumbing",
  "Finishes",
  "Aggregates",
  "Lumber & Carpentry",
  "Electrical",
  "Roofing & Waterproofing",
] as const;
// Backend support confirmed for all three: pricelist_parser.py handles
// CSV/XLSX via pandas and PDF via pdfplumber (requires an actual ruled table
// in the PDF, not OCR/scanned images).
const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".pdf"];

function fmt(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

const STEPS = [
  { n: 1, label: "Upload File" },
  { n: 2, label: "Review & Detect" },
  { n: 3, label: "Map & Confirm" },
] as const;

// Purely a progress indicator derived from queue/review state (see
// `currentStep` below) — it doesn't gate which sections render. Pending
// Review in particular is a persistent queue that can hold rows from many
// past uploads, not a one-shot wizard screen, so it stays visible regardless
// of which step is "current".
function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map(({ n, label }, i) => (
        <div key={n} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                n < step
                  ? "bg-primary text-primary-foreground"
                  : n === step
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {n < step ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            <span
              className={`whitespace-nowrap text-[10px] font-semibold ${
                n === step ? "text-primary" : "text-gray-400"
              }`}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`mb-3 h-0.5 w-10 rounded transition ${n < step ? "bg-primary" : "bg-gray-100"}`} />
          )}
        </div>
      ))}
    </div>
  );
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
            {item.status === "processing" && "Normalizing…"}
          </p>
        )}
        {item.status === "done" && item.result && (
          <p className="text-xs text-green-700">
            Processed {item.result.processed} — {item.result.matched} matched, {item.result.new_items_created} new,{" "}
            {item.result.needs_review} flagged for review.
          </p>
        )}
        {item.status === "needs_mapping" && (
          <p className="text-xs text-amber-600">
            Couldn&apos;t auto-detect its columns — map them above to continue.
          </p>
        )}
        {item.status === "failed" && (
          <p className="text-xs text-red-600">{item.failureReason || "Failed — check the backend logs."}</p>
        )}
      </div>
      <div className="mt-0.5 shrink-0">
        {item.status === "queued" && <Clock className="h-4 w-4 text-gray-300" />}
        {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {item.status === "needs_mapping" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
        {item.status === "failed" && <AlertTriangle className="h-4 w-4 text-red-500" />}
      </div>
    </div>
  );
}

type ReviewEditDraft = {
  raw_name: string;
  raw_unit: string;
  raw_price: string;
  confidence: string;
  suggested_category_type: string;
  suggested_material: string;
  suggested_brand: string;
  description: string;
};

function reviewItemToDraft(item: PricelistReviewItem): ReviewEditDraft {
  const initialDescription = item.description || item.suggested_brand || "";
  const initialBrand = item.description ? item.suggested_brand ?? "" : "";

  return {
    raw_name: item.raw_name,
    raw_unit: item.raw_unit,
    raw_price: String(item.raw_price),
    confidence: String(Math.round(item.confidence * 100)),
    suggested_category_type: item.suggested_category_type ?? "Uncategorized",
    suggested_material: item.suggested_material ?? "",
    suggested_brand: initialBrand,
    description: initialDescription,
  };
}

function draftToPatch(draft: ReviewEditDraft): PricelistReviewItemUpdate {
  const confidencePercent = Number(draft.confidence);
  const resolvedDescription = draft.description.trim() || null;
  const resolvedBrand = draft.suggested_brand.trim() || (resolvedDescription ? "Generic" : null);
  return {
    raw_name: draft.raw_name.trim(),
    raw_unit: draft.raw_unit.trim(),
    raw_price: Number(draft.raw_price),
    confidence: Number.isFinite(confidencePercent) ? confidencePercent / 100 : 0,
    suggested_category_type: draft.suggested_category_type.trim() || null,
    suggested_material: draft.suggested_material.trim() || null,
    suggested_brand: resolvedBrand,
    description: resolvedDescription,
  };
}

function ReviewItemRow({
  item,
  isEditing,
  draft,
  isSaving,
  isSelected,
  selectionDisabled,
  onToggleSelect,
  onEdit,
  onDraftChange,
  onSave,
  onDelete,
}: {
  item: PricelistReviewItem;
  isEditing: boolean;
  draft: ReviewEditDraft;
  isSaving: boolean;
  isSelected: boolean;
  selectionDisabled: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDraftChange: (patch: Partial<ReviewEditDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const inputClass =
    "h-8 w-full min-w-[7rem] rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";

  const checkboxCell = (
    <td className="w-8 py-2 pr-2">
      <input
        type="checkbox"
        checked={isSelected}
        disabled={selectionDisabled}
        onChange={onToggleSelect}
        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Select ${item.raw_name}`}
      />
    </td>
  );

  if (!isEditing) {
    return (
      <tr>
        {checkboxCell}
        <td className="py-2 pr-4 font-medium text-gray-800">{item.raw_name}</td>
        <td className="py-2 pr-4 text-gray-500">{item.raw_unit}</td>
        <td className="py-2 pr-4 text-gray-500">{fmt(item.raw_price)}</td>
        <td className="py-2 pr-4 text-gray-500">{(item.confidence * 100).toFixed(0)}%</td>
        <td className="py-2 pr-4 text-gray-500">{item.suggested_category_type ?? "—"}</td>
        <td className="py-2 pr-4 text-gray-500">{item.description || item.suggested_brand || "—"}</td>
        <td className="py-2 pr-4 text-gray-500">{item.suggested_brand || "Generic"}</td>
        <td className="py-2 pr-4 text-gray-500">{item.source || "Supplier"}</td>
        <td className="py-2 text-right">
          <div className="flex justify-end gap-1">
            <button
              type="button"
              disabled={isSaving}
              onClick={onSave}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white transition hover:bg-(--primary-hover) disabled:opacity-60"
              aria-label={`Save ${item.raw_name}`}
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-primary"
              aria-label={`Edit ${item.raw_name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={onDelete}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
              aria-label={`Delete ${item.raw_name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-orange-50/20 align-top">
      {checkboxCell}
      <td className="py-2 pr-4">
        <input
          value={draft.raw_name}
          onChange={(e) => onDraftChange({ raw_name: e.target.value })}
          className={`${inputClass} min-w-[16rem]`}
        />
      </td>
      <td className="py-2 pr-4">
        <input
          value={draft.raw_unit}
          onChange={(e) => onDraftChange({ raw_unit: e.target.value })}
          className="h-8 w-24 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </td>
      <td className="py-2 pr-4">
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={draft.raw_price}
          onChange={(e) => onDraftChange({ raw_price: e.target.value })}
          className="h-8 w-28 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </td>
      <td className="py-2 pr-4">
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          value={draft.confidence}
          onChange={(e) => onDraftChange({ confidence: e.target.value })}
          className="h-8 w-20 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </td>
      <td className="py-2 pr-4">
        <select
          value={draft.suggested_category_type}
          onChange={(e) => onDraftChange({ suggested_category_type: e.target.value })}
          className="h-8 min-w-[12rem] rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        >
          {CATEGORIES.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-4">
        <input
          value={draft.description}
          onChange={(e) => onDraftChange({ description: e.target.value })}
          className={inputClass}
          placeholder="Specification / Description"
        />
      </td>
      <td className="py-2 pr-4">
        <input
          value={draft.suggested_brand}
          onChange={(e) => onDraftChange({ suggested_brand: e.target.value })}
          className={inputClass}
          placeholder="Generic"
        />
      </td>
      <td className="py-2 pr-4 text-gray-500">{item.source}</td>
      <td className="py-2">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            disabled={isSaving}
            onClick={onSave}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white transition hover:bg-(--primary-hover) disabled:opacity-60"
            aria-label={`Save ${item.raw_name}`}
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            disabled
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-primary/60"
            aria-label={`Edit ${item.raw_name}`}
            title="Currently editing"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onDelete}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
            aria-label={`Delete ${item.raw_name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
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
  const {
    queue,
    enqueueFiles,
    resolveColumnMapping,
    cancelColumnMapping,
    clearFinishedQueueItems,
    updateReviewItem,
    deleteReviewItem,
    reviewItems,
    isLoadingReview,
    reviewError,
    refetchReview,
    clearPendingReview,
    isClearingReview,
    clearReviewError,
  } = usePricelistNormalization();

  const mappingItem = queue.find((item) => item.status === "needs_mapping");

  // Draft mapping for whichever file is currently stuck in 'needs_mapping' —
  // pre-filled from what the backend's tiers 1-3 DID resolve, so the user
  // only has to pick the field(s) that actually need a human. Only one item
  // can be in this state at a time (see usePricelistNormalization's queue
  // guard), so a single draft is enough.
  const [mappingColumns, setMappingColumns] = useState<DetectedColumn<NormalizationField>[]>([]);

  useEffect(() => {
    if (!mappingItem?.mappingInfo) return;
    const { availableColumns, detectedMapping } = mappingItem.mappingInfo;
    setMappingColumns(
      availableColumns.map((col) => ({
        raw_column: col,
        mapped_field:
          NORMALIZATION_FIELDS.find((field) => detectedMapping[field] === col) ?? null,
        source_files: [mappingItem.file.name],
      }))
    );
    // Re-derive only when a (possibly different) file's mapping info shows up, not on every
    // queue update — otherwise every edit to mappingColumns itself would get clobbered by
    // this effect re-running off the same mappingItem reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappingItem?.mappingInfo]);

  const updateMappingColumn = (rawColumn: string, mappedField: NormalizationField | null) => {
    setMappingColumns((prev) => prev.map((c) => (c.raw_column === rawColumn ? { ...c, mapped_field: mappedField } : c)));
  };

  const mappingComplete = NORMALIZATION_FIELDS.every((field) =>
    mappingColumns.some((c) => c.mapped_field === field)
  );

  const handleConfirmMapping = () => {
    if (!mappingItem || !mappingComplete) return;
    const mapping = Object.fromEntries(
      NORMALIZATION_FIELDS.map((field) => [field, mappingColumns.find((c) => c.mapped_field === field)!.raw_column])
    ) as Record<NormalizationField, string>;
    resolveColumnMapping(mappingItem.id, mapping);
  };

  // Two-click inline confirm rather than a native confirm() dialog — this
  // permanently deletes every Pending row with no undo.
  const [confirmingClear, setConfirmingClear] = useState(false);

  const handleClearReview = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    clearPendingReview().catch(() => {});
  };

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileTypeError, setFileTypeError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState<(typeof SOURCES)[number]>("Supplier");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ReviewEditDraft | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [reviewSaveError, setReviewSaveError] = useState<string | null>(null);
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<number>>(new Set());
  const [isBulkApproving, setIsBulkApproving] = useState(false);
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
    enqueueFiles(pendingFiles, source);
    setPendingFiles([]);
  };

  const startEditing = (item: PricelistReviewItem) => {
    setReviewSaveError(null);
    setEditingId(item.review_id);
    setEditDraft(reviewItemToDraft(item));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditDraft(null);
    setReviewSaveError(null);
  };

  const saveEditing = async () => {
    if (editingId === null || editDraft === null) return;
    await saveReviewItem(editingId, { ...draftToPatch(editDraft), status: "Approved" });
    cancelEditing();
  };

  const saveReviewItem = async (reviewId: number, patch: PricelistReviewItemUpdate) => {
    setSavingId(reviewId);
    setReviewSaveError(null);
    try {
      await updateReviewItem(reviewId, patch);
    } catch (err) {
      setReviewSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  };

  const removeReviewItem = async (reviewId: number) => {
    setSavingId(reviewId);
    setReviewSaveError(null);
    try {
      await deleteReviewItem(reviewId);
      if (editingId === reviewId) {
        cancelEditing();
      }
    } catch (err) {
      setReviewSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  };

  const toggleSelectReviewItem = (reviewId: number) => {
    setSelectedReviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(reviewId)) {
        next.delete(reviewId);
      } else {
        next.add(reviewId);
      }
      return next;
    });
  };

  const allReviewItemsSelected = reviewItems.length > 0 && selectedReviewIds.size === reviewItems.length;

  const toggleSelectAllReviewItems = () => {
    setSelectedReviewIds(allReviewItemsSelected ? new Set() : new Set(reviewItems.map((item) => item.review_id)));
  };

  const approveSelectedReviewItems = async () => {
    const ids = Array.from(selectedReviewIds);
    if (ids.length === 0) return;

    setIsBulkApproving(true);
    setReviewSaveError(null);
    const failedNames: string[] = [];

    // Sequential rather than Promise.all — each approval writes to the shared
    // catalog/approval-cache, and this reuses the same savingId spinner the
    // single-row Save button already shows, one row at a time.
    for (const reviewId of ids) {
      const item = reviewItems.find((r) => r.review_id === reviewId);
      if (!item) continue;
      setSavingId(reviewId);
      try {
        await updateReviewItem(reviewId, { ...draftToPatch(reviewItemToDraft(item)), status: "Approved" });
        setSelectedReviewIds((prev) => {
          const next = new Set(prev);
          next.delete(reviewId);
          return next;
        });
      } catch (err) {
        failedNames.push(item.raw_name);
      }
    }

    setSavingId(null);
    setIsBulkApproving(false);
    if (failedNames.length > 0) {
      setReviewSaveError(`Failed to approve: ${failedNames.join(", ")}`);
    }
  };

  const isQueueBusy = queue.some((item) =>
    ["queued", "uploading", "pending", "processing"].includes(item.status)
  );
  const hasFinishedItems = queue.some((item) => item.status === "done" || item.status === "failed");

  // Column detection / row matching is in flight (or needs a human to map
  // columns) -> step 2. Nothing in flight but rows are waiting on a decision
  // -> step 3. Otherwise idle, ready for the next upload -> step 1.
  const currentStep: 1 | 2 | 3 = mappingItem || isQueueBusy ? 2 : reviewItems.length > 0 ? 3 : 1;

  return (
    <div className="flex flex-col gap-5">
      <Stepper step={currentStep} />

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        {mappingItem?.mappingInfo ? (
          <div className="flex flex-col gap-4">
            {mappingItem.mappingInfo.previewRows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-gray-400">
                      {mappingItem.mappingInfo.availableColumns.map((col) => (
                        <th key={col} className="whitespace-nowrap px-3 py-2 font-semibold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {mappingItem.mappingInfo.previewRows.map((row, i) => (
                      <tr key={i}>
                        {mappingItem.mappingInfo!.availableColumns.map((col) => (
                          <td key={col} className="whitespace-nowrap px-3 py-2 text-gray-600">
                            {row[col] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ColumnMappingStep
              title="Map Columns"
              description={`"${mappingItem.file.name}" doesn't use column headers we recognize automatically — match each field to the right column using the preview above.`}
              columns={mappingColumns}
              sections={[
                {
                  title: "Price List Columns",
                  requiredFields: NORMALIZATION_FIELDS,
                  optionalFields: [],
                },
              ]}
              fieldLabels={NORMALIZATION_FIELD_LABELS}
              onUpdateMapping={updateMappingColumn}
              onBack={() => cancelColumnMapping(mappingItem.id)}
              onContinue={handleConfirmMapping}
              continueLabel="Confirm & Normalize"
              continueDisabled={!mappingComplete}
            />
          </div>
        ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-col gap-1.5 sm:w-56">
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
              className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-16 transition ${
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
              <UploadCloud className="h-8 w-8 text-gray-400" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">Drag &amp; drop your pricelist here</p>
                <p className="text-xs text-gray-400">
                  or click to browse — select multiple files at once, queued and processed one at a time
                </p>
              </div>
              <div className="flex gap-1.5">
                {["CSV", "XLSX", "PDF"].map((f) => (
                  <span
                    key={f}
                    className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-gray-500"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
            {fileTypeError && <p className="text-xs text-red-500">{fileTypeError}</p>}

            {pendingFiles.length > 0 && (
              <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Selected Files ({pendingFiles.length})
                </p>
                <div className="flex flex-col divide-y divide-gray-100">
                  {pendingFiles.map((f) => (
                    <div key={f.name} className="flex items-center gap-3 py-2">
                      <FileIcon className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="flex-1 truncate text-sm text-gray-700">{f.name}</span>
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
                <button
                  type="button"
                  onClick={handleUpload}
                  className="mt-2 flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
                >
                  <Upload className="h-4 w-4" />
                  {pendingFiles.length > 1
                    ? `Upload & Normalize ${pendingFiles.length} Files`
                    : "Upload & Normalize"}
                </button>
              </div>
            )}
          </div>

          <QuickUploadGuide />
        </div>
        )}

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
              Low-confidence matches awaiting a decision. Use Check to approve and save to the Supplier
              price catalog.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAllReviewItems}
              disabled={reviewItems.length === 0 || isBulkApproving}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allReviewItemsSelected ? "Deselect All" : "Select All"}
            </button>
            <button
              type="button"
              onClick={approveSelectedReviewItems}
              disabled={selectedReviewIds.size === 0 || isBulkApproving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {isBulkApproving ? "Approving…" : `Approve Selected (${selectedReviewIds.size})`}
            </button>
            {confirmingClear && (
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleClearReview}
              disabled={reviewItems.length === 0 || isClearingReview}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                confirmingClear
                  ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isClearingReview ? "Clearing…" : confirmingClear ? "Confirm — delete all?" : "Clear"}
            </button>
            <button
              type="button"
              onClick={refetchReview}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>
        {reviewSaveError && <p className="mb-3 text-xs text-red-500">{reviewSaveError}</p>}

        {clearReviewError && (
          <p className="mb-3 text-xs text-red-600">Couldn&apos;t clear review items: {clearReviewError.message}</p>
        )}

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
                  <th className="w-8 py-2 pr-2" />
                  <th className="py-2 pr-4">Raw Name</th>
                  <th className="py-2 pr-4">Unit</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">Confidence</th>
                  <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Specification</th>
                  <th className="py-2 pr-4">Brand</th>
                  <th className="py-2 pr-4">Source</th>
                    <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reviewItems.map((item) => (
                  <ReviewItemRow
                    key={item.review_id}
                    item={item}
                    isEditing={editingId === item.review_id}
                    draft={editingId === item.review_id && editDraft ? editDraft : reviewItemToDraft(item)}
                    isSaving={savingId === item.review_id}
                    isSelected={selectedReviewIds.has(item.review_id)}
                    selectionDisabled={isBulkApproving}
                    onToggleSelect={() => toggleSelectReviewItem(item.review_id)}
                    onEdit={() => startEditing(item)}
                    onDraftChange={(patch) => setEditDraft((current) => (current ? { ...current, ...patch } : current))}
                    onSave={() => {
                      if (editingId === item.review_id && editDraft) {
                        void saveEditing();
                        return;
                      }
                      void saveReviewItem(item.review_id, {
                        ...draftToPatch(reviewItemToDraft(item)),
                        status: "Approved",
                      });
                    }}
                    onDelete={() => removeReviewItem(item.review_id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </div>
    </div>
  );
}
