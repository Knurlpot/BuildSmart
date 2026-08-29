"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, File as FileIcon, Loader2, Pencil, Trash2, Upload as UploadIcon, X } from "lucide-react";
import {
  CLIENT_IMPORT_SOFT_ROW_CAP,
  clientRowNeedsAttention,
  useClientImport,
  type ExtractedClientRow,
} from "@/hooks/useClientImport";
import { CLIENT_TYPES } from "@/types/entities";

const ACCEPTED_EXTENSIONS = [".csv"];

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
          <p className="text-xs text-gray-400">or click to browse (CSV)</p>
        </div>
        <div className="flex gap-1.5">
          {["CSV"].map((f) => (
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

function ReviewStep({
  rows,
  onUpdateRow,
  onRemoveRow,
  onBack,
  onApproveSelected,
  isCommitting,
  commitError,
}: {
  rows: ExtractedClientRow[];
  onUpdateRow: (rowKey: string, patch: Partial<ExtractedClientRow>) => void;
  onRemoveRow: (rowKey: string) => void;
  onBack: () => void;
  onApproveSelected: (rows: ExtractedClientRow[]) => void;
  isCommitting: boolean;
  commitError: Error | null;
}) {
  const [isEditingAll, setIsEditingAll] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const attentionCount = useMemo(() => rows.filter(clientRowNeedsAttention).length, [rows]);
  const visibleRows = rows;
  const overCap = rows.length > CLIENT_IMPORT_SOFT_ROW_CAP;
  const selectedRows = useMemo(() => rows.filter((row) => selectedRowKeys.has(row.row_key)), [rows, selectedRowKeys]);
  const selectedCount = selectedRows.length;
  const selectedAttentionCount = useMemo(() => selectedRows.filter(clientRowNeedsAttention).length, [selectedRows]);
  const allVisibleRowsSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedRowKeys.has(row.row_key));
  const canApproveSelected = selectedRows.length > 0 && selectedAttentionCount === 0;

  const toggleRowSelection = (rowKey: string) => {
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      if (allVisibleRowsSelected) {
        visibleRows.forEach((row) => next.delete(row.row_key));
      } else {
        visibleRows.forEach((row) => next.add(row.row_key));
      }
      return next;
    });
  };

  const deleteSelectedRows = () => {
    selectedRows.forEach((row) => onRemoveRow(row.row_key));
    setSelectedRowKeys(new Set());
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              title="Back"
              className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div>
              <p className="text-sm font-bold text-gray-900">Pending Review</p>
              <p className="text-xs text-gray-500">Review the records from the client list.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isCommitting || !canApproveSelected}
              onClick={() => onApproveSelected(selectedRows)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCommitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {isCommitting ? "Approving..." : `Approve Selected (${selectedCount})`}
            </button>
            <button
              type="button"
              onClick={toggleSelectAllVisible}
              disabled={visibleRows.length === 0 || isCommitting}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allVisibleRowsSelected ? "Deselect All" : "Select All"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditingAll((current) => !current)}
              disabled={rows.length === 0 || isCommitting}
              aria-label={isEditingAll ? "Cancel editing" : "Edit"}
              title={isEditingAll ? "Cancel editing" : "Edit"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={deleteSelectedRows}
              disabled={selectedCount === 0 || isCommitting}
              aria-label={selectedCount > 0 ? `Delete selected (${selectedCount})` : "Delete"}
              title={selectedCount > 0 ? `Delete selected (${selectedCount})` : "Delete"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {overCap && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This upload has more than {CLIENT_IMPORT_SOFT_ROW_CAP.toLocaleString()} rows. Large uploads should be split into smaller files.
          </div>
        )}

        <section className="rounded-xl border border-gray-100 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Imported Clients</p>
              <p className="text-xs text-gray-500">
                {rows.length} record{rows.length === 1 ? "" : "s"} awaiting review
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {attentionCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                  {attentionCount} need{attentionCount !== 1 ? "" : "s"} attention
                </span>
              )}
            </div>
          </div>

          <div className="overflow-visible">
            <table className="w-full table-fixed text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="w-[4%] py-2 pr-2" />
                  <th className="w-[16%] py-2 pr-3">Client Name *</th>
                  <th className="w-[14%] py-2 pr-3">Contact Person *</th>
                  <th className="w-[16%] py-2 pr-3">Email</th>
                  <th className="w-[13%] py-2 pr-3">Contact Number *</th>
                  <th className="w-[20%] py-2 pr-3">Address *</th>
                  <th className="w-[10%] py-2 pr-3">Type</th>
                  <th className="w-[7%] py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleRows.map((row) => {
                  const attention = clientRowNeedsAttention(row);
                  return (
                    <tr key={row.row_key} className={attention ? "bg-amber-50/40" : ""}>
                      <td className="py-2 pr-2 align-top">
                        <input
                          type="checkbox"
                          checked={selectedRowKeys.has(row.row_key)}
                          onChange={() => toggleRowSelection(row.row_key)}
                          aria-label={`Select ${row.client_name || "client record"}`}
                          className="mt-2 h-4 w-4 rounded border-gray-300 accent-primary"
                        />
                      </td>
                      <td className="py-2 pr-3 align-top">
                        {isEditingAll ? (
                          <input
                            value={row.client_name}
                            onChange={(e) => onUpdateRow(row.row_key, { client_name: e.target.value })}
                            placeholder="Required"
                            className={`w-full min-w-0 rounded-lg border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 ${
                              !row.client_name.trim() ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50 focus:border-primary focus:bg-white"
                            }`}
                          />
                        ) : (
                          <p className="break-words text-sm font-medium text-gray-800">{row.client_name || "Required"}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        {isEditingAll ? (
                          <input
                            value={row.contact_person ?? ""}
                            onChange={(e) => onUpdateRow(row.row_key, { contact_person: e.target.value })}
                            placeholder="Required"
                            className={`w-full min-w-0 rounded-lg border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 ${
                              !row.contact_person?.trim() ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50 focus:border-primary focus:bg-white"
                            }`}
                          />
                        ) : (
                          <p className="break-words text-sm text-gray-700">{row.contact_person || "Required"}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        {isEditingAll ? (
                          <input
                            value={row.contact_email ?? ""}
                            onChange={(e) => onUpdateRow(row.row_key, { contact_email: e.target.value })}
                            placeholder="Optional"
                            className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                          />
                        ) : (
                          <p className="break-words text-sm text-gray-700">{row.contact_email || "Optional"}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        {isEditingAll ? (
                          <input
                            value={row.contact_number ?? ""}
                            onChange={(e) => onUpdateRow(row.row_key, { contact_number: e.target.value })}
                            placeholder="Required"
                            className={`w-full min-w-0 rounded-lg border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 ${
                              !row.contact_number?.trim() ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50 focus:border-primary focus:bg-white"
                            }`}
                          />
                        ) : (
                          <p className="break-words text-sm text-gray-700">{row.contact_number || "Required"}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        {isEditingAll ? (
                          <textarea
                            value={row.client_address ?? ""}
                            onChange={(e) => onUpdateRow(row.row_key, { client_address: e.target.value })}
                            placeholder="Required"
                            rows={2}
                            className={`w-full min-w-0 resize-none rounded-lg border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 ${
                              !row.client_address?.trim() ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50 focus:border-primary focus:bg-white"
                            }`}
                          />
                        ) : (
                          <p className="break-words text-sm text-gray-700">{row.client_address || "Required"}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        {isEditingAll ? (
                          <select
                            value={row.client_type ?? ""}
                            onChange={(e) => onUpdateRow(row.row_key, { client_type: (e.target.value || null) as ExtractedClientRow["client_type"] })}
                            className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs outline-none focus:border-primary focus:bg-white"
                          >
                            <option value="">Blank</option>
                            {CLIENT_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="break-words text-sm text-gray-700">{row.client_type || "Blank"}</p>
                        )}
                      </td>
                      <td className="py-2 text-right align-top">
                        <button
                          type="button"
                          onClick={() => {
                            onRemoveRow(row.row_key);
                            setSelectedRowKeys((current) => {
                              const next = new Set(current);
                              next.delete(row.row_key);
                              return next;
                            });
                          }}
                          title="Remove this row from the import"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {commitError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Import failed: {commitError.message}</div>
      )}
      {selectedCount > 0 && selectedAttentionCount > 0 && (
        <p className="text-xs text-gray-400">Resolve all flagged selected rows before approving.</p>
      )}
    </div>
  );
}

export function ImportClientsPanel({
  onImported,
  initialFiles,
  importKey,
}: {
  onImported?: () => void;
  initialFiles?: File[];
  importKey?: number;
}) {
  const { rows, updateRow, removeRow, uploadFiles, isUploading, uploadError, approveRows, isCommitting, commitError, commitResult } =
    useClientImport();
  const [step, setStep] = useState<1 | 2>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const processedImportKeyRef = useRef<number | null>(null);
  const hasPickerFiles = Boolean(importKey && initialFiles && initialFiles.length > 0);
  const selectedFiles = files.length > 0 ? files : initialFiles ?? [];

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

  useEffect(() => {
    if (!hasPickerFiles || importKey === processedImportKeyRef.current || !initialFiles) return;
    processedImportKeyRef.current = importKey ?? null;
    uploadFiles(initialFiles)
      .then(() => setStep(2))
      .catch(() => {});
  }, [hasPickerFiles, importKey, initialFiles, uploadFiles]);

  const handleApproveSelected = (selectedRows: ExtractedClientRow[]) => {
    approveRows(selectedRows)
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
      </div>
    );
  }

  if (step === 2) {
    return (
      <ReviewStep
        rows={rows}
        onUpdateRow={updateRow}
        onRemoveRow={removeRow}
        onBack={() => setStep(1)}
        onApproveSelected={handleApproveSelected}
        isCommitting={isCommitting}
        commitError={commitError}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <UploadIcon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-gray-900">Import Clients from Spreadsheet</h2>
      </div>
      {hasPickerFiles ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-center gap-3">
            <FileIcon className="h-4 w-4 shrink-0 text-gray-400" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-700">
                {isUploading ? "Processing spreadsheet..." : "Spreadsheet selected"}
              </p>
              <p className="truncate text-xs text-gray-400">{selectedFiles.map((file) => file.name).join(", ")}</p>
            </div>
          </div>
          {uploadError && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>Couldn&apos;t process these files: {uploadError.message}</span>
            </div>
          )}
        </div>
      ) : (
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
    </div>
  );
}
