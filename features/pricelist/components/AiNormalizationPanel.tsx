"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  File as FileIcon,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { ColumnMappingStep, type DetectedColumn } from "./ColumnMappingStep";
import { QuickUploadGuide } from "./QuickUploadGuide";
import { SupplierSearchInput } from "./SupplierSearchInput";
import { useFetch } from "@/hooks/useFetch";
import { useMutation } from "@/hooks/useMutation";
import {
  formatPhMobileE164,
  formatPhMobileNationalNumber,
  isValidPhMobileNumber,
  normalizePhMobileDigits,
} from "@/lib/ph-phone";
import {
  NORMALIZATION_FIELD_LABELS,
  usePricelistNormalization,
  type NormalizationField,
  type PricelistReviewItem,
  type PricelistReviewItemUpdate,
  type QueueItem,
} from "@/hooks/usePricelistNormalization";
import { PH_REGIONS, type PhRegion } from "@/types/entities/common";

const NORMALIZATION_FIELDS: NormalizationField[] = ["raw_name", "raw_unit", "raw_price"];

const SOURCES = ["DPWH", "Supplier"] as const;
const SUPPLIER_TYPES = ["Distributor", "Warehouse", "Retailer"] as const;
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
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
const REVIEW_PAGE_SIZE = 30;
const floatingInputCls =
  "peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";
const floatingLabelCls =
  "pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary";
const floatingSelectLabelCls = "pointer-events-none absolute left-4 text-gray-500 transition-all";
const floatingSelectLabelRestCls = "top-1/2 -translate-y-1/2 text-sm font-medium";
const floatingSelectLabelActiveCls = "top-1.5 translate-y-0 text-[10px] font-semibold";

type SupplierMode = "existing" | "new";
type SupplierType = (typeof SUPPLIER_TYPES)[number];

type SupplierRecord = {
  supplier_id: number;
  supplier_name: string;
  supplier_address: string;
  warehouse_loc: string | null;
  city: string;
  region: PhRegion;
  contact_email: string;
  contact_number: string;
  supplier_type: SupplierType;
  status: "Active" | "Inactive";
};

type SupplierForm = {
  supplier_name: string;
  supplier_address: string;
  city: string;
  region: PhRegion;
  contact_email: string;
  contact_number: string;
  supplier_type: SupplierType;
  warehouse_loc: string;
};

const emptySupplierForm = (): SupplierForm => ({
  supplier_name: "",
  supplier_address: "",
  city: "",
  region: "NCR",
  contact_email: "",
  contact_number: "",
  supplier_type: "Distributor",
  warehouse_loc: "",
});

function inferRegionFromLocation(location?: string | null) {
  if (!location) return null;
  const normalized = location
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(city|deo|district engineering office)\b/g, " ")
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/\bbacolod\b/.test(normalized) || /\bnegros occidental\b/.test(normalized)) return "Region VI";
  if (/\bdumaguete\b/.test(normalized) || /\bnegros oriental\b/.test(normalized) || /\bsiquijor\b/.test(normalized)) return "NIR";
  return null;
}

function fmt(n: number | null) {
  if (n == null) return "";
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
            {item.status === "processing" && "Normalizing…"}
          </p>
        )}
        {item.status === "done" && item.result && (
          item.result.skipped_duplicate ? (
            <p className="text-xs text-green-700">
              {item.result.message ?? "Already processed for this company and period."}
            </p>
          ) : (
            <p className="text-xs text-green-700">
              Processed {item.result.processed}. {item.result.needs_review} ready for review.
            </p>
          )
        )}
        {item.status === "needs_mapping" && (
          <p className="text-xs text-amber-600">
            Couldn&apos;t detect the columns. Map them above to continue.
          </p>
        )}
        {item.status === "failed" && (
          <p className="text-xs text-red-600">{item.failureReason || "Failed. Check the backend logs."}</p>
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
  color: string;
};

type PendingFileEntry = {
  id: string;
  file: File;
};

function reviewItemToDraft(item: PricelistReviewItem): ReviewEditDraft {
  return {
    raw_name: item.raw_name,
    raw_unit: item.raw_unit,
    raw_price: item.raw_price == null ? "" : String(item.raw_price),
    confidence: String(Math.round(item.confidence * 100)),
    suggested_category_type: item.suggested_category_type ?? "Uncategorized",
    suggested_material: item.suggested_material ?? "",
    suggested_brand: item.suggested_brand ?? "Generic",
    description: item.description ?? "",
    color: item.color ?? "",
  };
}

function draftToPatch(draft: ReviewEditDraft): PricelistReviewItemUpdate {
  const confidencePercent = Number(draft.confidence);
  const rawPrice = draft.raw_price.trim() ? Number(draft.raw_price) : null;
  const resolvedDescription = draft.description.trim() || null;
  const resolvedBrand = draft.suggested_brand.trim() || "Generic";
  return {
    raw_name: draft.raw_name.trim(),
    raw_unit: draft.raw_unit.trim(),
    raw_price: rawPrice,
    confidence: Number.isFinite(confidencePercent) ? confidencePercent / 100 : 0,
    suggested_category_type: draft.suggested_category_type.trim() || null,
    suggested_material: draft.suggested_material.trim() || null,
    suggested_brand: resolvedBrand,
    description: resolvedDescription,
    color: draft.color.trim() || null,
  };
}

function ReviewItemRow({
  item,
  isEditing,
  draft,
  isSelected,
  selectionDisabled,
  useDpwhColumns,
  onToggleSelect,
  onDraftChange,
}: {
  item: PricelistReviewItem;
  isEditing: boolean;
  draft: ReviewEditDraft;
  isSelected: boolean;
  selectionDisabled: boolean;
  useDpwhColumns: boolean;
  onToggleSelect: () => void;
  onDraftChange: (patch: Partial<ReviewEditDraft>) => void;
}) {
  const inputClass =
    "h-8 w-full min-w-[7rem] rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
  const displayRegion = item.region || inferRegionFromLocation(item.location) || "—";
  const displayLocation = item.location || "—";

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
        <td className="py-2 pr-4 text-gray-500">{item.suggested_category_type ?? "—"}</td>
        {useDpwhColumns ? (
          <>
            <td className="py-2 pr-4 text-gray-500">{displayRegion}</td>
            <td className="py-2 pr-4 text-gray-500">{displayLocation}</td>
          </>
        ) : (
          <>
            <td className="py-2 pr-4 text-gray-500">{item.description || "—"}</td>
            <td className="py-2 pr-4 text-gray-500">{item.color || "—"}</td>
            <td className="py-2 pr-4 text-gray-500">{item.suggested_brand || "Generic"}</td>
          </>
        )}
        <td className="py-2 pr-4 text-gray-500">{item.source || "Supplier"}</td>
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
          placeholder=""
          className="h-8 w-28 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
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
      {useDpwhColumns && (
        <>
          <td className="py-2 pr-4 text-gray-500">{displayRegion}</td>
          <td className="py-2 pr-4 text-gray-500">{displayLocation}</td>
        </>
      )}
      {!useDpwhColumns && (
        <>
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
              value={draft.color}
              onChange={(e) => onDraftChange({ color: e.target.value })}
              className={inputClass}
              placeholder="Color"
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
        </>
      )}
      <td className="py-2 pr-4 text-gray-500">{item.source}</td>
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
interface AiNormalizationPanelProps {
  companyId?: number | null;
  defaultSupplierMode?: SupplierMode;
  onCatalogChanged?: () => void;
}

export function AiNormalizationPanel({ companyId, defaultSupplierMode = "existing", onCatalogChanged }: AiNormalizationPanelProps) {
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
    clearReviewError,
  } = usePricelistNormalization(companyId);
  const suppliers = useFetch<SupplierRecord[]>("/api/suppliers");
  const createSupplier = useMutation<SupplierRecord>();

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
    const timeoutId = window.setTimeout(() => {
      setMappingColumns(
        availableColumns.map((col) => ({
          raw_column: col,
          mapped_field:
            NORMALIZATION_FIELDS.find((field) => detectedMapping[field] === col) ?? null,
          source_files: [mappingItem.file.name],
        }))
      );
    }, 0);
    return () => window.clearTimeout(timeoutId);
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

  const [pendingFiles, setPendingFiles] = useState<PendingFileEntry[]>([]);
  const [fileTypeError, setFileTypeError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState<(typeof SOURCES)[number]>("Supplier");
  const [supplierMode, setSupplierMode] = useState<SupplierMode>(defaultSupplierMode);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(() => emptySupplierForm());
  const [supplierFormErrors, setSupplierFormErrors] = useState<Partial<Record<keyof SupplierForm, string>>>({});
  const [supplierRegionFocused, setSupplierRegionFocused] = useState(false);
  const [supplierTypeFocused, setSupplierTypeFocused] = useState(false);
  const [quarter, setQuarter] = useState<(typeof QUARTERS)[number]>(
    QUARTERS[Math.floor(new Date().getMonth() / 3)]
  );
  const [year, setYear] = useState(new Date().getFullYear());
  // Global edit mode — every row edits at once (see startEditingAll/
  // saveAllEdits below), rather than one row at a time. editDrafts is keyed
  // by review_id so each row keeps its own in-progress values.
  const [isEditingAll, setIsEditingAll] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<number, ReviewEditDraft>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [reviewSaveError, setReviewSaveError] = useState<string | null>(null);
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<number>>(new Set());
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [reviewPagesBySource, setReviewPagesBySource] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const supplierModeChosenRef = useRef(false);

  useEffect(() => {
    if (!supplierModeChosenRef.current && defaultSupplierMode === "new") {
      setSupplierMode("new");
    }
  }, [defaultSupplierMode]);

  const chooseSupplierMode = (mode: SupplierMode) => {
    supplierModeChosenRef.current = true;
    setSupplierMode(mode);
  };

  const acceptFiles = (candidates: FileList | File[]) => {
    const accepted: PendingFileEntry[] = [];
    const rejected: string[] = [];

    for (const candidate of Array.from(candidates)) {
      const ext = "." + (candidate.name.split(".").pop() ?? "").toLowerCase();
      if (ACCEPTED_EXTENSIONS.includes(ext)) {
        accepted.push({
          id: `${candidate.name}-${candidate.size}-${candidate.lastModified}-${crypto.randomUUID()}`,
          file: candidate,
        });
      } else {
        rejected.push(candidate.name);
      }
    }

    if (rejected.length > 0) {
      setFileTypeError(`Skipped unsupported file(s): ${rejected.join(", ")}. Accepted formats: CSV, XLSX, or PDF.`);
    } else {
      setFileTypeError(null);
    }
    if (accepted.length > 0) {
      setPendingFiles((prev) => [...prev, ...accepted]);
    }
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((prev) => prev.filter((entry) => entry.id !== id));
  };

  const supplierFormComplete =
    supplierForm.supplier_name.trim() &&
    supplierForm.supplier_address.trim() &&
    supplierForm.city.trim() &&
    supplierForm.contact_email.trim() &&
    supplierForm.contact_number.trim() &&
    supplierForm.warehouse_loc.trim();
  const supplierRegionFloated = supplierRegionFocused || supplierForm.region !== "";
  const supplierTypeFloated = supplierTypeFocused || supplierForm.supplier_type !== "";
  const supplierReady =
    source !== "Supplier"
      ? true
      : supplierMode === "existing"
        ? selectedSupplierId != null
        : Boolean(supplierFormComplete);
  const uploadDisabled = pendingFiles.length === 0 || !supplierReady || createSupplier.isLoading;

  const updateSupplierForm = (patch: Partial<SupplierForm>) => {
    setSupplierForm((prev) => ({ ...prev, ...patch }));
    setSupplierFormErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof SupplierForm)[]) delete next[key];
      return next;
    });
  };

  const validateSupplierForm = () => {
    const errors: Partial<Record<keyof SupplierForm, string>> = {};
    if (!supplierForm.supplier_name.trim()) errors.supplier_name = "Supplier name is required";
    if (!supplierForm.supplier_address.trim()) errors.supplier_address = "Address is required";
    if (!supplierForm.city.trim()) errors.city = "City is required";
    if (!supplierForm.contact_email.trim()) errors.contact_email = "Email is required";
    if (!supplierForm.warehouse_loc.trim()) errors.warehouse_loc = "Warehouse location is required";
    if (!isValidPhMobileNumber(supplierForm.contact_number)) {
      errors.contact_number = "Use +63 format, e.g. +639171234567";
    }
    setSupplierFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;
    let supplierId = source === "Supplier" ? selectedSupplierId : null;
    if (source === "Supplier" && supplierMode === "new") {
      if (!validateSupplierForm()) return;
      const created = await createSupplier.mutate(
        "/api/suppliers",
        { ...supplierForm, contact_number: formatPhMobileE164(supplierForm.contact_number) },
        "POST"
      );
      supplierId = created.supplier_id;
      setSelectedSupplierId(created.supplier_id);
      setSupplierMode("existing");
      suppliers.refetch();
    }
    if (source === "Supplier" && supplierId == null) return;
    enqueueFiles(pendingFiles.map((entry) => entry.file), source, { quarter, year, supplierId });
    setPendingFiles([]);
  };

  // Seeds every currently-visible row's draft from its live values and
  // switches every row into the editing layout at once.
  const startEditingAll = () => {
    setReviewSaveError(null);
    const drafts: Record<number, ReviewEditDraft> = {};
    reviewItems.forEach((item) => {
      drafts[item.review_id] = reviewItemToDraft(item);
    });
    setEditDrafts(drafts);
    setIsEditingAll(true);
  };

  const cancelEditingAll = () => {
    setIsEditingAll(false);
    setEditDrafts({});
    setReviewSaveError(null);
  };

  const updateRowDraft = (item: PricelistReviewItem, patch: Partial<ReviewEditDraft>) => {
    setEditDrafts((prev) => {
      const current = prev[item.review_id] ?? reviewItemToDraft(item);
      return { ...prev, [item.review_id]: { ...current, ...patch } };
    });
  };

  // Commits every row's current draft in one shot — fields only, no status
  // change, so rows stay "Pending" and nothing is written to the price
  // catalog yet (approving a row is still a separate, explicit action).
  // Exits edit mode only once every row has saved; failures stay editable so
  // nothing already typed is lost, and the user can retry.
  const saveAllEdits = async () => {
    setIsSavingAll(true);
    setReviewSaveError(null);
    const failedNames: string[] = [];

    for (const item of reviewItems) {
      const draft = editDrafts[item.review_id] ?? reviewItemToDraft(item);
      setSavingId(item.review_id);
      try {
        await updateReviewItem(item.review_id, draftToPatch(draft));
      } catch {
        failedNames.push(item.raw_name);
      }
    }

    setSavingId(null);
    setIsSavingAll(false);
    if (failedNames.length > 0) {
      setReviewSaveError(`Failed to save: ${failedNames.join(", ")}`);
    } else {
      setIsEditingAll(false);
      setEditDrafts({});
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

  const toggleSelectAllReviewItems = (items: PricelistReviewItem[]) => {
    const ids = items.map((item) => item.review_id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedReviewIds.has(id));
    setSelectedReviewIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const approveSelectedReviewItems = async (candidateItems: PricelistReviewItem[]) => {
    const ids = candidateItems
      .map((item) => item.review_id)
      .filter((reviewId) => selectedReviewIds.has(reviewId));
    if (ids.length === 0) return;

    setIsBulkApproving(true);
    setReviewSaveError(null);
    const failedNames: string[] = [];

    // Sequential rather than Promise.all because each approval writes to the
    // shared catalog and approval cache.
    for (const reviewId of ids) {
      const item = reviewItems.find((r) => r.review_id === reviewId);
      if (!item) continue;
      setSavingId(reviewId);
      try {
        await updateReviewItem(reviewId, { ...draftToPatch(reviewItemToDraft(item)), status: "Approved" });
        onCatalogChanged?.();
        setSelectedReviewIds((prev) => {
          const next = new Set(prev);
          next.delete(reviewId);
          return next;
        });
      } catch {
        failedNames.push(item.raw_name);
      }
    }

    setSavingId(null);
    setIsBulkApproving(false);
    if (failedNames.length > 0) {
      setReviewSaveError(`Failed to approve: ${failedNames.join(", ")}`);
    }
  };

  const deleteSelectedReviewItems = async (candidateItems: PricelistReviewItem[]) => {
    const ids = candidateItems
      .map((item) => item.review_id)
      .filter((reviewId) => selectedReviewIds.has(reviewId));
    if (ids.length === 0) return;

    setIsBulkDeleting(true);
    setReviewSaveError(null);
    const failedNames: string[] = [];

    for (const reviewId of ids) {
      const item = reviewItems.find((r) => r.review_id === reviewId);
      if (!item) continue;
      setSavingId(reviewId);
      try {
        await deleteReviewItem(reviewId);
        setEditDrafts((prev) => {
          if (!(reviewId in prev)) return prev;
          const next = { ...prev };
          delete next[reviewId];
          return next;
        });
        setSelectedReviewIds((prev) => {
          const next = new Set(prev);
          next.delete(reviewId);
          return next;
        });
      } catch {
        failedNames.push(item.raw_name);
      }
    }

    setSavingId(null);
    setIsBulkDeleting(false);
    if (failedNames.length > 0) {
      setReviewSaveError(`Failed to delete: ${failedNames.join(", ")}`);
    }
  };

  const handleDeleteReview = (items: PricelistReviewItem[]) => {
    deleteSelectedReviewItems(items).catch(() => {});
  };

  const isQueueBusy = queue.some((item) =>
    ["queued", "uploading", "pending", "processing"].includes(item.status)
  );
  const hasFinishedItems = queue.some((item) => item.status === "done" || item.status === "failed");

  const reviewGroups = useMemo(() => {
    const grouped = new Map<string, PricelistReviewItem[]>();
    reviewItems.forEach((item) => {
      const key = item.source || "Supplier";
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => {
      if (a === "DPWH") return -1;
      if (b === "DPWH") return 1;
      if (a === "Supplier") return -1;
      if (b === "Supplier") return 1;
      return a.localeCompare(b);
    });
  }, [reviewItems]);

  const setReviewPageForSource = (sourceKey: string, updater: (page: number) => number) => {
    setReviewPagesBySource((prev) => ({
      ...prev,
      [sourceKey]: updater(prev[sourceKey] ?? 1),
    }));
  };

  return (
    <div className="flex flex-col gap-5">
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
              description={`"${mappingItem.file.name}" uses unrecognized headers. Match each field using the preview above.`}
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
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
            <div>
              <p className="text-base font-bold text-gray-900">Upload Pricelist</p>
              <p className="text-xs text-gray-500">Pick the supplier and period, then upload the file.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_8rem_8rem]">
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
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Quarter</label>
                <select
                  value={quarter}
                  onChange={(e) => setQuarter(e.target.value as (typeof QUARTERS)[number])}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                >
                  {QUARTERS.map((q) => (
                    <option key={q}>{q}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Year</label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {source === "Supplier" && (
              <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="grid items-center gap-3 lg:grid-cols-[7rem_auto_minmax(0,1fr)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-bold text-gray-900">Supplier</p>
                    </div>
                  </div>
                  <div className="grid w-fit grid-cols-2 rounded-xl border border-gray-200 bg-white p-1">
                    {(["existing", "new"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => chooseSupplierMode(mode)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                          supplierMode === mode
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                        }`}
                      >
                        {mode === "existing" ? "Existing" : "New"}
                      </button>
                    ))}
                  </div>
                  {supplierMode === "existing" && (
                    <div className="min-w-0">
                      <SupplierSearchInput
                        suppliers={suppliers.data ?? []}
                        selectedSupplierId={selectedSupplierId}
                        onSelectSupplier={setSelectedSupplierId}
                        isLoading={suppliers.isLoading}
                        className="max-w-none"
                      />
                    </div>
                  )}
                </div>

                {supplierMode === "existing" ? (
                  <div>
                    {suppliers.error && <p className="text-xs text-red-500">Couldn&apos;t load suppliers: {suppliers.error.message}</p>}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="relative">
                      <input
                        value={supplierForm.supplier_name}
                        onChange={(e) => updateSupplierForm({ supplier_name: e.target.value })}
                        placeholder=" "
                        aria-invalid={Boolean(supplierFormErrors.supplier_name)}
                        className={`${floatingInputCls} ${supplierFormErrors.supplier_name ? "border-red-400" : "border-gray-200"}`}
                      />
                      <label className={floatingLabelCls}>
                        Supplier name <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <div className="relative">
                      <input
                        value={supplierForm.contact_email}
                        onChange={(e) => updateSupplierForm({ contact_email: e.target.value })}
                        placeholder=" "
                        type="email"
                        aria-invalid={Boolean(supplierFormErrors.contact_email)}
                        className={`${floatingInputCls} ${supplierFormErrors.contact_email ? "border-red-400" : "border-gray-200"}`}
                      />
                      <label className={floatingLabelCls}>
                        Email <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <div className="relative">
                      <input
                        value={supplierForm.supplier_address}
                        onChange={(e) => updateSupplierForm({ supplier_address: e.target.value })}
                        placeholder=" "
                        aria-invalid={Boolean(supplierFormErrors.supplier_address)}
                        className={`${floatingInputCls} ${supplierFormErrors.supplier_address ? "border-red-400" : "border-gray-200"}`}
                      />
                      <label className={floatingLabelCls}>
                        Address <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <div className="relative flex flex-col gap-1.5">
                      <div className={`flex items-center rounded-lg border bg-gray-50 text-sm transition focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 ${supplierFormErrors.contact_number ? "border-red-400" : "border-gray-200"}`}>
                        <span className="pl-3 pt-3 text-gray-500 select-none">+63</span>
                        <input
                          value={formatPhMobileNationalNumber(normalizePhMobileDigits(supplierForm.contact_number))}
                          onChange={(e) => updateSupplierForm({ contact_number: normalizePhMobileDigits(e.target.value) })}
                          placeholder=" "
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          aria-invalid={Boolean(supplierFormErrors.contact_number)}
                          className="peer min-w-0 flex-1 bg-transparent px-2 pb-2 pt-5 outline-none"
                        />
                        <label className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition peer-focus:text-primary">
                          Contact number <span className="text-red-500">*</span>
                        </label>
                      </div>
                      {supplierFormErrors.contact_number && <p className="text-xs text-red-500">{supplierFormErrors.contact_number}</p>}
                    </div>
                    <div className="relative">
                      <input
                        value={supplierForm.city}
                        onChange={(e) => updateSupplierForm({ city: e.target.value })}
                        placeholder=" "
                        aria-invalid={Boolean(supplierFormErrors.city)}
                        className={`${floatingInputCls} ${supplierFormErrors.city ? "border-red-400" : "border-gray-200"}`}
                      />
                      <label className={floatingLabelCls}>
                        City <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <div className="relative">
                      <select
                        value={supplierForm.region}
                        onChange={(e) => updateSupplierForm({ region: e.target.value as PhRegion })}
                        onFocus={() => setSupplierRegionFocused(true)}
                        onBlur={() => setSupplierRegionFocused(false)}
                        aria-label="Region"
                        className="peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                      >
                        <option value=""></option>
                        {PH_REGIONS.map((region) => (
                          <option key={region}>{region}</option>
                        ))}
                      </select>
                      <label
                        className={`${floatingSelectLabelCls} ${supplierRegionFloated ? floatingSelectLabelActiveCls : floatingSelectLabelRestCls} ${supplierRegionFocused ? "text-primary" : ""}`}
                      >
                        Region <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <div className="relative">
                      <select
                        value={supplierForm.supplier_type}
                        onChange={(e) => updateSupplierForm({ supplier_type: e.target.value as SupplierType })}
                        onFocus={() => setSupplierTypeFocused(true)}
                        onBlur={() => setSupplierTypeFocused(false)}
                        aria-label="Supplier type"
                        className="peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                      >
                        <option value=""></option>
                        {SUPPLIER_TYPES.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                      <label
                        className={`${floatingSelectLabelCls} ${supplierTypeFloated ? floatingSelectLabelActiveCls : floatingSelectLabelRestCls} ${supplierTypeFocused ? "text-primary" : ""}`}
                      >
                        Supplier type <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <div className="relative">
                      <input
                        value={supplierForm.warehouse_loc}
                        onChange={(e) => updateSupplierForm({ warehouse_loc: e.target.value })}
                        placeholder=" "
                        aria-invalid={Boolean(supplierFormErrors.warehouse_loc)}
                        className={`${floatingInputCls} ${supplierFormErrors.warehouse_loc ? "border-red-400" : "border-gray-200"}`}
                      />
                      <label className={floatingLabelCls}>
                        Warehouse location <span className="text-red-500">*</span>
                      </label>
                    </div>
                  </div>
                )}
                {createSupplier.error && <p className="text-xs text-red-500">Couldn&apos;t save supplier: {createSupplier.error.message}</p>}
              </div>
            )}

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
                <p className="text-sm font-semibold text-gray-700">Upload Pricelist</p>
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

            <details className="group rounded-2xl border border-gray-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-gray-700">
                Need help?
                <ChevronRight className="h-4 w-4 text-gray-400 transition group-open:rotate-90" />
              </summary>
              <div className="border-t border-gray-100 p-4">
                <QuickUploadGuide />
              </div>
            </details>

            {pendingFiles.length > 0 && (
              <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Selected Files ({pendingFiles.length})
                </p>
                <div className="flex flex-col divide-y divide-gray-100">
                  {pendingFiles.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 py-2">
                      <FileIcon className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="flex-1 truncate text-sm text-gray-700">{entry.file.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePendingFile(entry.id);
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
                  disabled={uploadDisabled}
                  className="mt-2 flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
                >
                  {createSupplier.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {createSupplier.isLoading
                    ? "Saving Supplier..."
                    : pendingFiles.length > 1
                    ? `Upload & Normalize ${pendingFiles.length} Files`
                    : "Upload & Normalize"}
                </button>
              </div>
            )}
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
              Review the records from the pricelist.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={isEditingAll ? cancelEditingAll : startEditingAll}
              disabled={reviewItems.length === 0 || isBulkApproving || isBulkDeleting || isSavingAll}
              aria-label={isEditingAll ? "Cancel editing" : "Edit"}
              title={isEditingAll ? "Cancel editing" : "Edit"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {isEditingAll && (
              <button
                type="button"
                onClick={saveAllEdits}
                disabled={isSavingAll}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {isSavingAll ? "Saving…" : "Save All Changes"}
              </button>
            )}
            <button
              type="button"
              onClick={refetchReview}
              aria-label="Refresh"
              title="Refresh"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
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
        >
          <div className="flex flex-col gap-5">
            {reviewGroups.map(([sourceKey, sourceItems]) => {
              const useDpwhColumns = sourceKey === "DPWH";
              const selectedCount = sourceItems.filter((item) => selectedReviewIds.has(item.review_id)).length;
              const allSourceItemsSelected = sourceItems.length > 0 && selectedCount === sourceItems.length;
              const pageCount = Math.max(1, Math.ceil(sourceItems.length / REVIEW_PAGE_SIZE));
              const currentPage = Math.min(Math.max(1, reviewPagesBySource[sourceKey] ?? 1), pageCount);
              const showPagination = sourceItems.length > REVIEW_PAGE_SIZE;
              const pageStart = (currentPage - 1) * REVIEW_PAGE_SIZE;
              const pagedItems = showPagination
                ? sourceItems.slice(pageStart, pageStart + REVIEW_PAGE_SIZE)
                : sourceItems;
              const showingStart = sourceItems.length === 0 ? 0 : pageStart + 1;
              const showingEnd = Math.min(pageStart + pagedItems.length, sourceItems.length);

              return (
                <section key={sourceKey} className="rounded-xl border border-gray-100 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{sourceKey}</p>
                      <p className="text-xs text-gray-500">{sourceItems.length} record{sourceItems.length === 1 ? "" : "s"} awaiting review</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isEditingAll && (
                        <button
                          type="button"
                          onClick={() => approveSelectedReviewItems(sourceItems)}
                          disabled={selectedCount === 0 || isBulkApproving || isBulkDeleting}
                          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          {isBulkApproving ? "Approving…" : `Approve Selected (${selectedCount})`}
                        </button>
                      )}
                      {!isEditingAll && (
                        <button
                          type="button"
                          onClick={() => toggleSelectAllReviewItems(sourceItems)}
                          disabled={sourceItems.length === 0 || isBulkApproving || isBulkDeleting}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {allSourceItemsSelected ? "Deselect All" : "Select All"}
                        </button>
                      )}
                      {!isEditingAll && (
                        <button
                          type="button"
                          onClick={() => handleDeleteReview(sourceItems)}
                          disabled={selectedCount === 0 || isBulkDeleting || isBulkApproving}
                          aria-label={isBulkDeleting ? "Deleting…" : selectedCount > 0 ? `Delete selected (${selectedCount})` : "Delete"}
                          title={isBulkDeleting ? "Deleting…" : selectedCount > 0 ? `Delete selected (${selectedCount})` : "Delete"}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                          <th className="w-8 py-2 pr-2" />
                          <th className="py-2 pr-4">Raw Name</th>
                          <th className="py-2 pr-4">UOM</th>
                          <th className="py-2 pr-4">Price</th>
                          <th className="py-2 pr-4">Category</th>
                          {useDpwhColumns ? (
                            <>
                              <th className="py-2 pr-4">Region</th>
                              <th className="py-2 pr-4">Location</th>
                            </>
                          ) : (
                            <>
                              <th className="py-2 pr-4">Specification</th>
                              <th className="py-2 pr-4">Color</th>
                              <th className="py-2 pr-4">Brand</th>
                            </>
                          )}
                          <th className="py-2 pr-4">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {pagedItems.map((item) => (
                          <ReviewItemRow
                            key={item.review_id}
                            item={item}
                            isEditing={isEditingAll}
                            draft={editDrafts[item.review_id] ?? reviewItemToDraft(item)}
                            isSelected={selectedReviewIds.has(item.review_id)}
                            selectionDisabled={isBulkApproving || isBulkDeleting || isEditingAll || savingId === item.review_id}
                            useDpwhColumns={useDpwhColumns}
                            onToggleSelect={() => toggleSelectReviewItem(item.review_id)}
                            onDraftChange={(patch) => updateRowDraft(item, patch)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {showPagination && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                      <p className="text-xs font-medium text-gray-500">
                        Showing {showingStart}-{showingEnd} of {sourceItems.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setReviewPageForSource(sourceKey, (page) => Math.max(1, page - 1))}
                          disabled={currentPage === 1}
                          aria-label={`Previous ${sourceKey} page`}
                          title="Previous page"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-20 text-center text-xs font-semibold text-gray-600">
                          Page {currentPage} of {pageCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => setReviewPageForSource(sourceKey, (page) => Math.min(pageCount, page + 1))}
                          disabled={currentPage === pageCount}
                          aria-label={`Next ${sourceKey} page`}
                          title="Next page"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </QueryState>
      </div>
    </div>
  );
}
