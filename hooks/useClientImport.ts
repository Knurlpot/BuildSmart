// PART B (Task 6) — "My Clients" spreadsheet import. Mirrors usePricelistUpload.ts's
// upload -> map -> review -> commit shape exactly (same ingestion discipline the task spec
// asks for), scaled down to ONE row type since `client` is a single table, not two.
//
// Assumed endpoints — UNVERIFIED, confirm with the backend team, same convention as
// usePricelistUpload.ts's header comment:
//   POST /api/clients/import/upload (multipart FormData: one or more `files` entries)
//        -> { columns: DetectedClientColumn[], rows: ExtractedClientRow[] }
//        Column detection + CSV/XLSX parsing is backend work (pandas, same as pricelist
//        upload) — this hook only posts the files and renders whatever comes back.
//   POST /api/clients/import/commit
//        (body: { columns: DetectedClientColumn[], rows: ExtractedClientRow[] })
//        -> { saved_count: number }
//        Each row becomes one `client` row (company_id from the session, client_id read back
//        server-side — never invented here). status defaults server-side ('Active'); this
//        import never sends a status.
//
// NO FABRICATION: a spreadsheet cell that's blank (or a column the user leaves unmapped)
// must reach commit as `null`, never as `''` or a guessed default — see ExtractedClientRow.
import { useState } from 'react';
import { useMutation } from './useMutation';
import type { ClientType } from '@/types/entities';

export type ClientImportField =
  | 'client_name'
  | 'contact_person'
  | 'contact_email'
  | 'contact_number'
  | 'client_address'
  | 'client_type'
  | 'notes';

export const CLIENT_IMPORT_REQUIRED_FIELDS: ClientImportField[] = ['client_name', 'contact_person', 'contact_number', 'client_address'];
export const CLIENT_IMPORT_OPTIONAL_FIELDS: ClientImportField[] = [
  'contact_email',
  'client_type',
  'notes',
];

export interface DetectedClientColumn {
  raw_column: string;
  mapped_field: ClientImportField | null;
  source_files: string[];
}

export interface ExtractedClientRow {
  row_key: string; // client-side staging key — NOT a database id
  client_name: string;
  contact_person: string | null;
  contact_email: string | null;
  contact_number: string | null;
  client_address: string | null;
  client_type: ClientType | null; // null = left blank in the sheet; NOT defaulted client-side
  notes: string | null;
  needs_mapping: boolean; // client_name column wasn't mapped/detected
}

export interface ClientImportUploadResponse {
  columns: DetectedClientColumn[];
  rows: ExtractedClientRow[];
}

export interface ClientImportCommitResponse {
  saved_count: number;
}

export function clientRowNeedsAttention(row: ExtractedClientRow): boolean {
  return row.needs_mapping || !row.client_name.trim() || !row.contact_person?.trim() || !row.contact_number?.trim() || !row.client_address?.trim();
}

export const CLIENT_IMPORT_SOFT_ROW_CAP = 5000;

export function useClientImport() {
  const [rows, setRows] = useState<ExtractedClientRow[]>([]);
  const [columns, setColumns] = useState<DetectedClientColumn[]>([]);
  const upload = useMutation<ClientImportUploadResponse>();
  const commit = useMutation<ClientImportCommitResponse>();

  const uploadFiles = async (files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    const res = await upload.mutate('/api/clients/import/upload', form, 'POST');
    setColumns(res.columns ?? []);
    setRows(res.rows ?? []);
    return res;
  };

  const updateRow = (rowKey: string, patch: Partial<ExtractedClientRow>) => {
    setRows((prev) => prev.map((r) => (r.row_key === rowKey ? { ...r, ...patch } : r)));
  };

  const removeRow = (rowKey: string) => {
    setRows((prev) => prev.filter((r) => r.row_key !== rowKey));
  };

  const approveRows = (selectedRows: ExtractedClientRow[]) => commit.mutate('/api/clients/import/commit', { columns, rows: selectedRows }, 'POST');

  const reset = () => {
    setRows([]);
    setColumns([]);
    upload.reset();
    commit.reset();
  };

  return {
    rows,
    updateRow,
    removeRow,
    uploadFiles,
    isUploading: upload.isLoading,
    uploadError: upload.error,
    approveRows,
    isCommitting: commit.isLoading,
    commitError: commit.error,
    commitResult: commit.data,
    reset,
  };
}
