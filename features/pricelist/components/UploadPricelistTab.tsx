"use client";

import { useRef, useState } from "react";
import { Check, File as FileIcon, Upload as UploadIcon, X } from "lucide-react";
import { QuickUploadGuide } from "./QuickUploadGuide";
import { ColumnMappingStep } from "./ColumnMappingStep";
import { RowReviewStep } from "./RowReviewStep";
import { SavedCatalogView } from "./SavedCatalogView";
import {
  ITEM_OPTIONAL_FIELDS,
  ITEM_REQUIRED_FIELDS,
  SUPPLIER_OPTIONAL_FIELDS,
  SUPPLIER_REQUIRED_FIELDS,
  SYSTEM_FIELD_LABELS,
  usePricelistUpload,
} from "@/hooks/usePricelistUpload";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".pdf"];

const STEPS = [
  { n: 1, label: "Upload File" },
  { n: 2, label: "Review & Detect" },
  { n: 3, label: "Map & Confirm" },
] as const;

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

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPricelistTab({ onViewCatalog }: { onViewCatalog?: () => void }) {
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...list.filter((f) => !existingNames.has(f.name))];
    });
  };

  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const handleConfirm = () => {
    if (files.length === 0) return;
    uploadFiles(files)
      .then(() => setStep(2))
      .catch(() => {});
  };

  const handleUploadAnother = () => {
    reset();
    setFiles([]);
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
      <Stepper step={step} />

      {step === 1 && (
        <div className="flex gap-5">
          <div className="flex flex-1 flex-col gap-4">
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
                  disabled={isUploading}
                  onClick={handleConfirm}
                  className="mt-2 w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
                >
                  {isUploading ? "Uploading…" : "Confirm & Continue"}
                </button>
              </div>
            )}

            {uploadError && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span>Couldn&apos;t process these files: {uploadError.message}</span>
                <button
                  type="button"
                  onClick={handleConfirm}
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
        <div className="flex flex-col gap-3">
          <ColumnMappingStep
            description={`Match each detected column to a BuildSmart field — scroll down to map both item and supplier columns. This applies once to the whole upload (${itemRows.length} item row${itemRows.length !== 1 ? "s" : ""}${supplierRows.length > 0 ? `, ${supplierRows.length} supplier row${supplierRows.length !== 1 ? "s" : ""}` : ""}).`}
            columns={columns}
            sections={[
              { title: "Item Columns", requiredFields: ITEM_REQUIRED_FIELDS, optionalFields: ITEM_OPTIONAL_FIELDS },
              {
                title: "Supplier Columns",
                requiredFields: SUPPLIER_REQUIRED_FIELDS,
                optionalFields: SUPPLIER_OPTIONAL_FIELDS,
                emptyHint: "No detected columns yet.",
              },
            ]}
            fieldLabels={SYSTEM_FIELD_LABELS}
            onUpdateMapping={updateColumnMapping}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
          {supplierRows.length === 0 && (
            <p className="text-xs text-gray-400">
              No file supplied supplier columns — that&apos;s fine, leave the Supplier section
              unmapped and Map &amp; Confirm&apos;s Suppliers view will show nothing to confirm.
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <RowReviewStep
          itemRows={itemRows}
          onUpdateItemRow={updateItemRow}
          onRemoveItemRow={removeItemRow}
          supplierRows={supplierRows}
          onUpdateSupplierRow={updateSupplierRow}
          onBack={() => setStep(2)}
          onApprove={() => approve().catch(() => {})}
          isCommitting={isCommitting}
          commitError={commitError}
        />
      )}
    </div>
  );
}
