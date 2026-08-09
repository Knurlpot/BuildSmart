"use client";

// PART B (Task 6) — "My Clients" spreadsheet import. Same upload -> map -> review/confirm
// discipline as features/pricelist/components/UploadPricelistTab.tsx (+ ColumnMappingStep +
// RowReviewStep), collapsed into one file since a client row has far fewer fields than an
// item/supplier pair. NO FABRICATION: a blank/unmapped cell stays `null` all the way through
// to commit — see useClientImport.ts's header comment.
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, File as FileIcon, Upload as UploadIcon, Users, X } from "lucide-react";
import {
  CLIENT_IMPORT_OPTIONAL_FIELDS,
  CLIENT_IMPORT_REQUIRED_FIELDS,
  CLIENT_IMPORT_SOFT_ROW_CAP,
  clientRowNeedsAttention,
  useClientImport,
  type ClientImportField,
  type DetectedClientColumn,
  type ExtractedClientRow,
} from "@/hooks/useClientImport";
import { CLIENT_TYPES } from "@/types/entities";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx"];

const FIELD_LABELS: Record<ClientImportField, string> = {
  client_name: "Client / Company Name",
  contact_person: "Contact Person",
  contact_email: "Contact Email",
  contact_number: "Contact Number",
  client_address: "Address",
  client_type: "Client Type",
  default_downpayment_percentage: "Downpayment on File (%)",
  notes: "Notes",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadStep({
  files,
  addFiles,
  removeFile,
  dragging,
  setDragging,
  onConfirm,
  isUploading,
  uploadError,
}: {
  files: File[];
  addFiles: (f: FileList | File[]) => void;
  removeFile: (name: string) => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onConfirm: () => void;
  isUploading: boolean;
  uploadError: Error | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-4">
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
          dragging ? "border-primary bg-orange-50/30" : "border-gray-200 bg-gray-50 hover:border-primary hover:bg-orange-50/20"
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
          <p className="text-sm font-semibold text-gray-700">Drag &amp; drop your client list here</p>
          <p className="text-xs text-gray-400">or click to browse (CSV or XLSX)</p>
        </div>
        <div className="flex gap-1.5">
          {["CSV", "XLSX"].map((f) => (
            <span key={f} className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-gray-500">
              {f}
            </span>
          ))}
        </div>
      </div>

      {files.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Selected Files ({files.length})</p>
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
            onClick={onConfirm}
            className="mt-2 w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
          >
            {isUploading ? "Uploading…" : "Confirm & Continue"}
          </button>
        </div>
      )}

      {uploadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>Couldn&apos;t process these files: {uploadError.message}</span>
        </div>
      )}
    </div>
  );
}

function MappingStep({
  columns,
  rowCount,
  onUpdateMapping,
  onBack,
  onContinue,
}: {
  columns: DetectedClientColumn[];
  rowCount: number;
  onUpdateMapping: (rawColumn: string, mappedField: ClientImportField | null) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const FieldRow = ({ field, required }: { field: ClientImportField; required: boolean }) => {
    const mappedColumn = columns.find((c) => c.mapped_field === field);
    const handleChange = (rawColumn: string) => {
      if (mappedColumn && mappedColumn.raw_column !== rawColumn) onUpdateMapping(mappedColumn.raw_column, null);
      if (rawColumn === "") return;
      onUpdateMapping(rawColumn, field);
    };
    return (
      <div className="flex items-center gap-4 px-4 py-2.5">
        <span className="flex w-52 shrink-0 items-center gap-1.5 text-sm font-semibold text-gray-700">
          {FIELD_LABELS[field]}
          {required ? <span className="text-red-500">*</span> : <span className="text-[10px] font-medium text-gray-400">(optional)</span>}
        </span>
        <select
          value={mappedColumn?.raw_column ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
        >
          <option value="">— Skip this column —</option>
          {columns.map((c) => (
            <option key={c.raw_column} value={c.raw_column} disabled={c.mapped_field !== null && c.mapped_field !== field}>
              {c.raw_column}
              {c.mapped_field !== null && c.mapped_field !== field ? ` (used for ${FIELD_LABELS[c.mapped_field]})` : ""}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">Review &amp; Detect</h3>
          <p className="text-xs text-gray-500">
            Match each detected column to a client field ({rowCount} row{rowCount !== 1 ? "s" : ""} detected).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
          >
            Map &amp; Confirm <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-col divide-y divide-gray-100">
          {CLIENT_IMPORT_REQUIRED_FIELDS.map((f) => (
            <FieldRow key={f} field={f} required />
          ))}
          {CLIENT_IMPORT_OPTIONAL_FIELDS.map((f) => (
            <FieldRow key={f} field={f} required={false} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  rows,
  onUpdateRow,
  onRemoveRow,
  onBack,
  onApprove,
  isCommitting,
  commitError,
}: {
  rows: ExtractedClientRow[];
  onUpdateRow: (rowKey: string, patch: Partial<ExtractedClientRow>) => void;
  onRemoveRow: (rowKey: string) => void;
  onBack: () => void;
  onApprove: () => void;
  isCommitting: boolean;
  commitError: Error | null;
}) {
  const attentionCount = rows.filter(clientRowNeedsAttention).length;
  const overCap = rows.length > CLIENT_IMPORT_SOFT_ROW_CAP;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">Map &amp; Confirm</h3>
          <p className="text-xs text-gray-500">Review each row before importing. Blank cells stay blank.</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
      </div>

      {overCap && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This upload has more than {CLIENT_IMPORT_SOFT_ROW_CAP.toLocaleString()} rows. Large uploads should be split into smaller files.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">
          <strong>{rows.length}</strong> row{rows.length !== 1 ? "s" : ""} total
        </p>
        {attentionCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
            {attentionCount} need{attentionCount !== 1 ? "" : "s"} attention
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Client Name *</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Downpayment on File</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const attention = clientRowNeedsAttention(row);
              return (
                <tr key={row.row_key} className={`border-b border-gray-50 ${attention ? "bg-amber-50/40" : ""}`}>
                  <td className="px-4 py-2.5">
                    <input
                      value={row.client_name}
                      onChange={(e) => onUpdateRow(row.row_key, { client_name: e.target.value })}
                      placeholder="Required"
                      className={`w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 ${
                        !row.client_name.trim() ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50 focus:border-primary focus:bg-white"
                      }`}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">
                    <div>{row.contact_person ?? <span className="text-gray-300">—</span>}</div>
                    <div className="text-gray-400">{row.contact_email ?? row.contact_number ?? ""}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={row.client_type ?? ""}
                      onChange={(e) => onUpdateRow(row.row_key, { client_type: (e.target.value || null) as ExtractedClientRow["client_type"] })}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:bg-white"
                    >
                      <option value="">— blank —</option>
                      {CLIENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">
                    {row.default_downpayment_percentage !== null ? `${row.default_downpayment_percentage}%` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(row.row_key)}
                      title="Remove this row from the import"
                      className="rounded p-1 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {commitError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Import failed: {commitError.message}</div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={isCommitting || rows.length === 0 || rows.some((r) => !r.client_name.trim())}
          onClick={onApprove}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
        >
          {isCommitting ? "Importing…" : `Import ${rows.length} Client${rows.length !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

export function ImportClientsPanel({ onImported }: { onImported?: () => void }) {
  const { rows, updateRow, removeRow, columns, updateColumnMapping, uploadFiles, isUploading, uploadError, approve, isCommitting, commitError, commitResult, reset } =
    useClientImport();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...list.filter((f) => !existingNames.has(f.name))];
    });
  };
  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const handleConfirmUpload = () => {
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

  const handleApprove = () => {
    approve()
      .then(() => onImported?.())
      .catch(() => {});
  };

  if (commitResult) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200 bg-white p-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900">Clients imported</p>
          <p className="mt-1 text-sm text-gray-500">
            {commitResult.saved_count} client{commitResult.saved_count !== 1 ? "s" : ""} added to My Clients.
          </p>
        </div>
        <button
          type="button"
          onClick={handleUploadAnother}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <UploadIcon className="h-4 w-4" /> Import Another File
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-gray-900">Import Clients from Spreadsheet</h2>
      </div>
      {step === 1 && (
        <UploadStep
          files={files}
          addFiles={addFiles}
          removeFile={removeFile}
          dragging={dragging}
          setDragging={setDragging}
          onConfirm={handleConfirmUpload}
          isUploading={isUploading}
          uploadError={uploadError}
        />
      )}
      {step === 2 && <MappingStep columns={columns} rowCount={rows.length} onUpdateMapping={updateColumnMapping} onBack={() => setStep(1)} onContinue={() => setStep(3)} />}
      {step === 3 && (
        <ReviewStep
          rows={rows}
          onUpdateRow={updateRow}
          onRemoveRow={removeRow}
          onBack={() => setStep(2)}
          onApprove={handleApprove}
          isCommitting={isCommitting}
          commitError={commitError}
        />
      )}
    </div>
  );
}
