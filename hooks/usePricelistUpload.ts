// Assumed endpoints — UNVERIFIED, confirm with the backend team:
//   POST /api/pricelist/upload (multipart FormData: one or more `files` entries)
//        -> { columns: DetectedColumn[], item_rows: ExtractedItemRow[], supplier_rows: ExtractedSupplierRow[] }
//        Multiple files are sent in ONE request and pooled: `columns` is the deduped set of
//        raw columns detected across every file, so mapping happens once for the whole batch.
//   POST /api/pricelist/commit
//        (body: { columns: DetectedColumn[], item_rows: ExtractedItemRow[], supplier_rows: ExtractedSupplierRow[] })
//        -> { saved_count: number }
//        A row feeds TWO tables (schema v3): the material definition -> items, and its price
//        observation -> historical_price_record. Supplier attribution is BATCH-level, not
//        per-row: schema v3's "one supplier per upload batch" shape means the backend creates
//        (or matches) ONE supplier from `supplier_rows[0]` and stamps that resulting
//        supplier_id onto every historical_price_record row this batch commits. If
//        `supplier_rows` is empty (no supplier file/columns mapped), the backend presumably
//        commits item rows with a null supplier_id — matches historical_price_record's
//        nullable supplier_id (schema v3 change A).
//
// Extraction (pandas/pdfplumber) and column detection are entirely backend work — this hook
// only posts the files and renders whatever comes back. `columns` lets the user correct a
// mis-detected column-to-field mapping before confirming; the (possibly edited) mapping is
// sent back alongside the rows on commit so the backend can reconcile it. Whether the backend
// actually returns a confidence score is unconfirmed, so there is no confidence field here and
// none should be added without backend confirmation.
//
// `ExtractedItemRow`/`ExtractedSupplierRow` are FRONTEND STAGING shapes, not table mirrors:
// these rows aren't persisted until commit, so they carry no item_code/historicalrec_id/
// supplier_id yet — those are database-generated and read back from the commit response only.
import { useState } from 'react';
import type { DetectedColumn } from '@/features/pricelist/components/ColumnMappingStep';
import { useMutation } from './useMutation';

// "price" is grouped into the Items mapping section for UX (it lives on the same row as the
// material's other columns in a real spreadsheet) even though it lands in
// historical_price_record, not items, at commit time. "region" is intentionally NOT a
// per-item field here: schema v3 doesn't force a per-row region when the batch's single
// supplier already implies one — the mapped supplier's region is what the backend should use
// for every historical_price_record row in this batch. See ExtractedSupplierRow.region.
export type ItemSystemField =
  | 'item_name'
  | 'material'
  | 'brand'
  | 'unit'
  | 'category_id'
  | 'item_source'
  | 'price'
  | 'quality'
  | 'size_width'
  | 'size_length'
  | 'color'
  | 'description';

export type SupplierSystemField =
  | 'supplier_name'
  | 'supplier_address'
  | 'city'
  | 'region'
  | 'contact_email'
  | 'contact_number'
  | 'supplier_type'
  | 'warehouse_loc';

export type SystemField = ItemSystemField | SupplierSystemField;

export const ITEM_REQUIRED_FIELDS: ItemSystemField[] = [
  'item_name',
  'material',
  'brand',
  'unit',
  'category_id',
  'item_source',
  'price',
];
export const ITEM_OPTIONAL_FIELDS: ItemSystemField[] = [
  'quality',
  'size_width',
  'size_length',
  'color',
  'description',
];
export const SUPPLIER_REQUIRED_FIELDS: SupplierSystemField[] = [
  'supplier_name',
  'supplier_address',
  'city',
  'region',
  'contact_email',
  'contact_number',
  'supplier_type',
];
export const SUPPLIER_OPTIONAL_FIELDS: SupplierSystemField[] = ['warehouse_loc'];

export const SYSTEM_FIELDS: SystemField[] = [
  ...ITEM_REQUIRED_FIELDS,
  ...ITEM_OPTIONAL_FIELDS,
  ...SUPPLIER_REQUIRED_FIELDS,
  ...SUPPLIER_OPTIONAL_FIELDS,
];

export const SYSTEM_FIELD_LABELS: Record<SystemField, string> = {
  item_name: "Item Name",
  material: "Material",
  brand: "Brand",
  unit: "Unit",
  category_id: "Category",
  item_source: "Item Source",
  price: "Price",
  quality: "Quality",
  size_width: "Size (Width)",
  size_length: "Size (Length)",
  color: "Color",
  description: "Description",
  supplier_name: "Supplier Name",
  supplier_address: "Supplier Address",
  city: "City",
  region: "Region",
  contact_email: "Contact Email",
  contact_number: "Contact Number",
  supplier_type: "Supplier Type",
  warehouse_loc: "Warehouse Location",
};

export type { DetectedColumn };

export interface ExtractedItemRow {
  row_key: string; // client-side staging key — NOT a database id, never sent as one
  item_name: string;
  material: string;
  brand: string;
  unit: string;
  category_id: number | null; // resolved server-side from a raw category label; null = unresolved
  item_source: 'DPWH' | 'PSA' | 'Supplier' | 'Internal';
  quality?: string;
  size_width?: number;
  size_length?: number;
  color?: string;
  description?: string;
  price: number;
  recorded_at: string;
  needs_mapping: boolean; // any required field above is missing
}

export interface ExtractedSupplierRow {
  row_key: string;
  supplier_name: string;
  supplier_address: string;
  city: string;
  region: string;
  contact_email: string;
  contact_number: string;
  supplier_type: 'Distributor' | 'Warehouse' | 'Retailer' | '';
  warehouse_loc?: string;
  needs_mapping: boolean;
}

export interface UploadResponse {
  columns: DetectedColumn<SystemField>[];
  item_rows: ExtractedItemRow[];
  supplier_rows: ExtractedSupplierRow[];
}

export interface CommitResponse {
  saved_count: number;
}

/** Missing a required field — the editability rule in Part C keys off this per-field, this is the row-level summary. */
export function itemRowNeedsAttention(row: ExtractedItemRow): boolean {
  return (
    row.needs_mapping ||
    !row.item_name.trim() ||
    !row.material.trim() ||
    !row.brand.trim() ||
    !row.unit.trim() ||
    row.category_id === null ||
    row.price <= 0
  );
}

export function supplierRowNeedsAttention(row: ExtractedSupplierRow): boolean {
  return (
    row.needs_mapping ||
    !row.supplier_name.trim() ||
    !row.supplier_address.trim() ||
    !row.city.trim() ||
    !row.region.trim() ||
    !row.contact_email.trim() ||
    !row.contact_number.trim() ||
    row.supplier_type === ''
  );
}

/** Soft warning threshold — construction pricelists can run 4,000+ rows. Adjust freely. */
export const SOFT_ROW_CAP = 5000;

export function usePricelistUpload() {
  const [itemRows, setItemRows] = useState<ExtractedItemRow[]>([]);
  const [supplierRows, setSupplierRows] = useState<ExtractedSupplierRow[]>([]);
  const [columns, setColumns] = useState<DetectedColumn<SystemField>[]>([]);
  const upload = useMutation<UploadResponse>();
  const commit = useMutation<CommitResponse>();

  const uploadFiles = async (files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    const res = await upload.mutate('/api/pricelist/upload', form, 'POST');
    setColumns(res.columns ?? []);
    setItemRows(res.item_rows ?? []);
    setSupplierRows(res.supplier_rows ?? []);
    return res;
  };

  const updateColumnMapping = (rawColumn: string, mappedField: SystemField | null) => {
    setColumns((prev) => prev.map((c) => (c.raw_column === rawColumn ? { ...c, mapped_field: mappedField } : c)));
  };

  const updateItemRow = (rowKey: string, patch: Partial<ExtractedItemRow>) => {
    setItemRows((prev) => prev.map((r) => (r.row_key === rowKey ? { ...r, ...patch } : r)));
  };

  const removeItemRow = (rowKey: string) => {
    setItemRows((prev) => prev.filter((r) => r.row_key !== rowKey));
  };

  const updateSupplierRow = (rowKey: string, patch: Partial<ExtractedSupplierRow>) => {
    setSupplierRows((prev) => prev.map((r) => (r.row_key === rowKey ? { ...r, ...patch } : r)));
  };

  const approve = () => commit.mutate('/api/pricelist/commit', { columns, item_rows: itemRows, supplier_rows: supplierRows }, 'POST');

  const reset = () => {
    setItemRows([]);
    setSupplierRows([]);
    setColumns([]);
    upload.reset();
    commit.reset();
  };

  return {
    itemRows,
    updateItemRow,
    removeItemRow,
    supplierRows,
    updateSupplierRow,
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
