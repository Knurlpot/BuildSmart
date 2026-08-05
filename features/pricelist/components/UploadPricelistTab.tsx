"use client";

import { useRef, useState } from "react";
import { Building2, Calendar, File as FileIcon, Upload as UploadIcon, X } from "lucide-react";
import { QuickUploadGuide } from "./QuickUploadGuide";
import { ColumnMappingStep } from "./ColumnMappingStep";
import { RowReviewStep } from "./RowReviewStep";
import { SavedCatalogView } from "./SavedCatalogView";
import { useFetch } from "@/hooks/useFetch";
import { useMutation } from "@/hooks/useMutation";
import {
  formatPhMobileNationalNumber,
  formatPhMobileE164,
  isValidPhMobileNumber,
  normalizePhMobileDigits,
} from "@/lib/ph-phone";
import {
  ITEM_OPTIONAL_FIELDS,
  ITEM_REQUIRED_FIELDS,
  SUPPLIER_OPTIONAL_FIELDS,
  SUPPLIER_REQUIRED_FIELDS,
  SYSTEM_FIELD_LABELS,
  usePricelistUpload,
} from "@/hooks/usePricelistUpload";
import type { SystemField } from "@/hooks/usePricelistUpload";
import { useWorkflowHeader } from "@/providers/WorkflowHeaderProvider";
import { PH_REGIONS, type PhRegion } from "@/types/entities/common";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".pdf"];
const SOURCES = ["DPWH", "Supplier"] as const;
const SUPPLIER_TYPES = ["Distributor", "Warehouse", "Retailer"] as const;

type Source = (typeof SOURCES)[number];
type SupplierMode = "new" | "existing";
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

function emptySupplierForm(): SupplierForm {
  return {
    supplier_name: "",
    supplier_address: "",
    city: "",
    region: "NCR",
    contact_email: "",
    contact_number: "",
    supplier_type: "Distributor",
    warehouse_loc: "",
  };
}

// Part A — the same reusable orange workflow header/arrow-step chrome Quotation Generation
// registers (see providers/WorkflowHeaderProvider.tsx's header comment: "Pricelist setup
// later" — this is that later). Registered ONLY while this specific tab is mounted; the
// other Pricelist tabs (Published Sources and Price Catalog) never call this hook,
// so switching to any of them unmounts this component,
// clears the registration, and the header reverts to its normal white state on its own —
// nothing else needs to know this tab existed.
const WORKFLOW_STEPS = [
  { number: 1, label: "Upload File" },
  { number: 2, label: "Review & Detect" },
  { number: 3, label: "Map & Confirm" },
];

const MAPPING_SECTIONS = [
  {
    title: "Item Columns",
    requiredFields: ITEM_REQUIRED_FIELDS,
    optionalFields: ITEM_OPTIONAL_FIELDS,
  },
  {
    title: "Supplier Columns",
    requiredFields: SUPPLIER_REQUIRED_FIELDS,
    optionalFields: SUPPLIER_OPTIONAL_FIELDS,
    emptyHint: "Supplier details can be supplied separately if this file only contains material prices.",
  },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPricelistTab({
  onViewCatalog,
  workflowComplete = false,
}: {
  onViewCatalog?: () => void;
  workflowComplete?: boolean;
}) {
  const {
    itemRows,
    updateItemRow,
    removeItemRow,
    supplierRows,
    updateSupplierRow,
    columns,
    updateColumnMapping,
    uploadFiles,
    isUploading,
    uploadError,
    approve,
    isCommitting,
    commitError,
    commitResult,
    reset,
  } = usePricelistUpload();
  const suppliers = useFetch<SupplierRecord[]>("/api/suppliers");
  const createSupplier = useMutation<SupplierRecord>();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<Source>("Supplier");
  const [supplierMode, setSupplierMode] = useState<SupplierMode>("new");
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(() => emptySupplierForm());
  const [supplierFormErrors, setSupplierFormErrors] = useState<Partial<Record<keyof SupplierForm, string>>>({});
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useWorkflowHeader(workflowComplete ? null : { label: "Upload Pricelist", steps: WORKFLOW_STEPS, currentStep: step });

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...list.filter((f) => !existingNames.has(f.name))];
    });
  };

  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name));

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
    if (!isValidPhMobileNumber(supplierForm.contact_number)) {
      errors.contact_number = "Use +63 format, e.g. +639171234567";
    }
    setSupplierFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const supplierFormComplete =
    supplierForm.supplier_name.trim() &&
    supplierForm.supplier_address.trim() &&
    supplierForm.city.trim() &&
    supplierForm.contact_email.trim() &&
    supplierForm.contact_number.trim();
  const supplierReady =
    source === "DPWH" ? true : supplierMode === "existing" ? selectedSupplierId != null : Boolean(supplierFormComplete);
  const confirmDisabled = files.length === 0 || !effectiveDate || !supplierReady || isUploading || createSupplier.isLoading;

  const handleConfirm = async () => {
    if (files.length === 0 || !effectiveDate) return;
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
    uploadFiles(files, effectiveDate, { source, supplierId })
      .then(() => setStep(2))
      .catch(() => {});
  };

  const handleUploadAnother = () => {
    reset();
    setFiles([]);
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setStep(1);
  };

  if (commitResult) {
    return (
      <SavedCatalogView
        savedCount={commitResult.saved_count}
        onUploadAnother={handleUploadAnother}
        onViewCatalog={onViewCatalog}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-bold text-gray-900">Upload Pricelist</h2>
        <p className="text-sm text-gray-500">
          Upload your company&apos;s internal pricelist for the system to use in Quotation
          Generation.
        </p>
      </div>

      {step === 1 && (
        <div className="flex gap-5">
          <div className="flex flex-1 flex-col gap-4">
            <div className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-4 md:grid-cols-[1fr_auto] md:items-end">
              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="text-xs font-bold uppercase tracking-wider text-gray-500">Source</legend>
                <div className="grid w-full max-w-xl grid-cols-2 gap-3">
                  {SOURCES.map((item) => (
                    <label
                      key={item}
                      className={`grid h-10 cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
                        source === item
                          ? "border-primary bg-orange-50 text-primary"
                          : "border-gray-200 bg-white text-gray-700 hover:border-primary/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="pricelist-source"
                        value={item}
                        checked={source === item}
                        onChange={() => setSource(item)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-center">{item}</span>
                      <span className="h-4 w-4" aria-hidden="true" />
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-col gap-2 md:w-80">
                <label htmlFor="pricelist-effective-date" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                  <Calendar className="h-4 w-4 text-primary" />
                  Effective Date
                </label>
                <input
                  id="pricelist-effective-date"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
            </div>

            {source === "Supplier" && (
              <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <p className="text-sm font-bold text-gray-900">Supplier</p>
                  </div>
                  <div className="grid grid-cols-2 rounded-xl border border-gray-200 bg-gray-50 p-1">
                    {(["new", "existing"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSupplierMode(mode)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                          supplierMode === mode ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {mode === "new" ? "New Supplier" : "Existing Supplier"}
                      </button>
                    ))}
                  </div>
                </div>

                {supplierMode === "existing" ? (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="existing-supplier" className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Supplier Name
                    </label>
                    <select
                      id="existing-supplier"
                      value={selectedSupplierId ?? ""}
                      onChange={(e) => setSelectedSupplierId(e.target.value ? Number(e.target.value) : null)}
                      disabled={suppliers.isLoading}
                      className="h-10 w-full max-w-md rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
                    >
                      <option value="">{suppliers.isLoading ? "Loading suppliers..." : "Select supplier"}</option>
                      {(suppliers.data ?? []).map((supplier) => (
                        <option key={supplier.supplier_id} value={supplier.supplier_id}>
                          {supplier.supplier_name}
                        </option>
                      ))}
                    </select>
                    {suppliers.error && <p className="text-xs text-red-500">Couldn&apos;t load suppliers: {suppliers.error.message}</p>}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={supplierForm.supplier_name} onChange={(e) => updateSupplierForm({ supplier_name: e.target.value })} placeholder="Supplier name" aria-invalid={Boolean(supplierFormErrors.supplier_name)} className={`h-10 rounded-xl border bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 ${supplierFormErrors.supplier_name ? "border-red-400" : "border-gray-200"}`} />
                    <input value={supplierForm.contact_email} onChange={(e) => updateSupplierForm({ contact_email: e.target.value })} placeholder="Email" type="email" aria-invalid={Boolean(supplierFormErrors.contact_email)} className={`h-10 rounded-xl border bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 ${supplierFormErrors.contact_email ? "border-red-400" : "border-gray-200"}`} />
                    <input value={supplierForm.supplier_address} onChange={(e) => updateSupplierForm({ supplier_address: e.target.value })} placeholder="Address" aria-invalid={Boolean(supplierFormErrors.supplier_address)} className={`h-10 rounded-xl border bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 ${supplierFormErrors.supplier_address ? "border-red-400" : "border-gray-200"}`} />
                    <div className="flex flex-col gap-1">
                      <div className={`flex h-10 items-center rounded-xl border bg-white text-sm font-semibold text-gray-700 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 ${supplierFormErrors.contact_number ? "border-red-400" : "border-gray-200"}`}>
                        <span className="pl-3 text-gray-500 select-none">+63</span>
                        <input
                          value={formatPhMobileNationalNumber(normalizePhMobileDigits(supplierForm.contact_number))}
                          onChange={(e) => updateSupplierForm({ contact_number: normalizePhMobileDigits(e.target.value) })}
                          placeholder="917 123 4567"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          aria-invalid={Boolean(supplierFormErrors.contact_number)}
                          className="min-w-0 flex-1 bg-transparent px-2 outline-none"
                        />
                      </div>
                      {supplierFormErrors.contact_number && <p className="text-xs text-red-500">{supplierFormErrors.contact_number}</p>}
                    </div>
                    <input value={supplierForm.city} onChange={(e) => updateSupplierForm({ city: e.target.value })} placeholder="City" aria-invalid={Boolean(supplierFormErrors.city)} className={`h-10 rounded-xl border bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 ${supplierFormErrors.city ? "border-red-400" : "border-gray-200"}`} />
                    <select value={supplierForm.region} onChange={(e) => updateSupplierForm({ region: e.target.value as PhRegion })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15">
                      {PH_REGIONS.map((region) => <option key={region}>{region}</option>)}
                    </select>
                    <select value={supplierForm.supplier_type} onChange={(e) => updateSupplierForm({ supplier_type: e.target.value as SupplierType })} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15">
                      {SUPPLIER_TYPES.map((type) => <option key={type}>{type}</option>)}
                    </select>
                    <input value={supplierForm.warehouse_loc} onChange={(e) => updateSupplierForm({ warehouse_loc: e.target.value })} placeholder="Warehouse location" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
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
                if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-16 transition ${
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
                  if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <UploadIcon className="h-8 w-8 text-gray-400" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">Drag &amp; drop your pricelist here</p>
                <p className="text-xs text-gray-400">
                  or click to browse — select multiple files at once (e.g. an item pricelist + a supplier info file)
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

            {files.length > 0 && (
              <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Selected Files ({files.length})
                </p>
                <div className="flex flex-col divide-y divide-gray-100">
                  {files.map((f) => (
                    <div key={f.name} className="flex items-center gap-3 py-2">
                      <FileIcon className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="flex-1 truncate text-sm text-gray-700">{f.name}</span>
                      <span className="shrink-0 text-xs text-gray-400">{formatSize(f.size)}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(f.name);
                        }}
                        title="Remove this file"
                        className="shrink-0 rounded p-1 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={confirmDisabled}
                  onClick={() => handleConfirm().catch(() => {})}
                  className="mt-2 w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
                >
                  {createSupplier.isLoading ? "Saving Supplier…" : isUploading ? "Uploading…" : "Confirm & Continue"}
                </button>
              </div>
            )}

            {uploadError && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span>Couldn&apos;t process these files: {uploadError.message}</span>
                <button
                  type="button"
                  onClick={() => handleConfirm().catch(() => {})}
                  className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          <QuickUploadGuide />
        </div>
      )}

      {step === 2 && (
        <ColumnMappingStep<SystemField>
          title="Review Detected Columns"
          description={`${itemRows.length} item rows and ${supplierRows.length} supplier rows detected.`}
          columns={columns}
          sections={MAPPING_SECTIONS}
          fieldLabels={SYSTEM_FIELD_LABELS}
          onUpdateMapping={updateColumnMapping}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <RowReviewStep
          itemRows={itemRows}
          onUpdateItemRow={updateItemRow}
          onRemoveItemRow={removeItemRow}
          supplierRows={supplierRows}
          onUpdateSupplierRow={updateSupplierRow}
          onBack={() => setStep(2)}
          onApprove={() => approve({ source, supplierId: source === "Supplier" ? selectedSupplierId : null }).catch(() => {})}
          isCommitting={isCommitting}
          commitError={commitError}
        />
      )}
    </div>
  );
}
