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
  | 'default_downpayment_percentage'
  | 'notes';

// Only client_name is NOT NULL on the real `client` table — every other column is
// nullable, including client_type (DB default 'New' applies server-side only if the column
// is genuinely absent from the row; an explicitly blank mapped cell still stays null here,
// never silently upgraded to 'New' by the frontend).
export const CLIENT_IMPORT_REQUIRED_FIELDS: ClientImportField[] = ['client_name'];
export const CLIENT_IMPORT_OPTIONAL_FIELDS: ClientImportField[] = [
  'contact_person',
  'contact_email',
  'contact_number',
  'client_address',
  'client_type',
  'default_downpayment_percentage',
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
  default_downpayment_percentage: number | null;
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
  return row.needs_mapping || !row.client_name.trim();
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

  const updateColumnMapping = (rawColumn: string, mappedField: ClientImportField | null) => {
    setColumns((prev) => prev.map((c) => (c.raw_column === rawColumn ? { ...c, mapped_field: mappedField } : c)));
  };

  const updateRow = (rowKey: string, patch: Partial<ExtractedClientRow>) => {
    setRows((prev) => prev.map((r) => (r.row_key === rowKey ? { ...r, ...patch } : r)));
  };

  const removeRow = (rowKey: string) => {
    setRows((prev) => prev.filter((r) => r.row_key !== rowKey));
  };

  const approve = () => commit.mutate('/api/clients/import/commit', { columns, rows }, 'POST');

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
    columns,
    updateColumnMapping,
    uploadFiles,
    isUploading: upload.isLoading,
    uploadError: upload.error,
    approve,
    isCommitting: commit.isLoading,
    commitError: commit.error,
    commitResult: commit.data,
    reset,
  };
}
