import { useState } from 'react';
import { useMutation } from './useMutation';

export type ItemSystemField =
  | 'item_name'
  | 'material'
  | 'brand'
  | 'unit'
  | 'category_type'
  | 'item_source'
  | 'price'
  | 'recorded_at'
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
  'price',
];
export const ITEM_OPTIONAL_FIELDS: ItemSystemField[] = [];
export const SUPPLIER_REQUIRED_FIELDS: SupplierSystemField[] = [
  'supplier_name',
  'region',
];
export const SUPPLIER_OPTIONAL_FIELDS: SupplierSystemField[] = [];

export const SYSTEM_FIELDS: SystemField[] = [
  ...ITEM_REQUIRED_FIELDS,
  ...ITEM_OPTIONAL_FIELDS,
  ...SUPPLIER_REQUIRED_FIELDS,
  ...SUPPLIER_OPTIONAL_FIELDS,
];

export interface DetectedColumn {
  raw_column: string;
  mapped_field: SystemField | null;
  /** Which uploaded file(s) this raw column was seen in — for display only. */
  source_files: string[];
}

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
  columns: DetectedColumn[];
  item_rows: ExtractedItemRow[];
  supplier_rows: ExtractedSupplierRow[];
  confidence?: number;
  requires_confirmation?: boolean;
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
  const [columns, setColumns] = useState<DetectedColumn[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const upload = useMutation<UploadResponse>();
  const commit = useMutation<CommitResponse>();

  const uploadFiles = async (files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    const res = await upload.mutate('/api/pricelist/upload', form, 'POST');
    setColumns(res.columns ?? []);
    setItemRows(res.item_rows ?? []);
    setSupplierRows(res.supplier_rows ?? []);
    setConfidence(typeof res.confidence === 'number' ? res.confidence : null);
    setRequiresConfirmation(Boolean(res.requires_confirmation));
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

  const approve = () =>
    commit.mutate(
      '/api/pricelist/commit',
      {
        columns,
        item_rows: itemRows,
        supplier_rows: supplierRows,
        confidence,
        requires_confirmation: requiresConfirmation,
        confirmed: true,
      },
      'POST'
    );

  const reset = () => {
    setItemRows([]);
    setSupplierRows([]);
    setColumns([]);
    setConfidence(null);
    setRequiresConfirmation(false);
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
    confidence,
    requiresConfirmation,
    isCommitting: commit.isLoading,
    commitError: commit.error,
    commitResult: commit.data,
    reset,
  };
}
