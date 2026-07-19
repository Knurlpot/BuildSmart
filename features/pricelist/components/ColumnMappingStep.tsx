"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ITEM_OPTIONAL_FIELDS,
  ITEM_REQUIRED_FIELDS,
  SUPPLIER_OPTIONAL_FIELDS,
  SUPPLIER_REQUIRED_FIELDS,
  type DetectedColumn,
  type ItemSystemField,
  type SupplierSystemField,
  type SystemField,
} from "@/hooks/usePricelistUpload";

const FIELD_LABELS: Record<SystemField, string> = {
  item_name: "Item Name",
  material: "Material",
  brand: "Brand",
  unit: "Unit",
  category_type: "Category",
  item_source: "Item Source",
  price: "Price",
  recorded_at: "Recorded At",
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

interface ColumnMappingStepProps {
  columns: DetectedColumn[];
  itemRowCount: number;
  supplierRowCount: number;
  onUpdateMapping: (rawColumn: string, mappedField: SystemField | null) => void;
  onBack: () => void;
  onContinue: () => void;
}

function FieldRow({
  field,
  required,
  columns,
  onUpdateMapping,
}: {
  field: SystemField;
  required: boolean;
  columns: DetectedColumn[];
  onUpdateMapping: (rawColumn: string, mappedField: SystemField | null) => void;
}) {
  // A field may be mapped from at most one detected column — find which one (if any).
  const mappedColumn = columns.find((c) => c.mapped_field === field);

  const handleChange = (rawColumn: string) => {
    // Clear this field off whatever column previously held it, then assign it to the new one.
    if (mappedColumn && mappedColumn.raw_column !== rawColumn) {
      onUpdateMapping(mappedColumn.raw_column, null);
    }
    if (rawColumn === "") return;
    onUpdateMapping(rawColumn, field);
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2.5">
      <span className="flex w-44 shrink-0 items-center gap-1.5 text-sm font-semibold text-gray-700">
        {FIELD_LABELS[field]}
        {required ? (
          <span className="text-red-500">*</span>
        ) : (
          <span className="text-[10px] font-medium text-gray-400">(optional)</span>
        )}
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
}

function Section({
  title,
  requiredFields,
  optionalFields,
  columns,
  onUpdateMapping,
  emptyHint,
}: {
  title: string;
  requiredFields: ItemSystemField[] | SupplierSystemField[];
  optionalFields: ItemSystemField[] | SupplierSystemField[];
  columns: DetectedColumn[];
  onUpdateMapping: (rawColumn: string, mappedField: SystemField | null) => void;
  emptyHint?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{title}</p>
      </div>
      {columns.length === 0 && emptyHint ? (
        <p className="px-4 py-6 text-center text-xs text-gray-400">{emptyHint}</p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100">
          {requiredFields.map((f) => (
            <FieldRow key={f} field={f} required columns={columns} onUpdateMapping={onUpdateMapping} />
          ))}
          {optionalFields.map((f) => (
            <FieldRow key={f} field={f} required={false} columns={columns} onUpdateMapping={onUpdateMapping} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ColumnMappingStep({
  columns,
  itemRowCount,
  supplierRowCount,
  onUpdateMapping,
  onBack,
  onContinue,
}: ColumnMappingStepProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Review &amp; Detect</h2>
          <p className="text-xs text-gray-500">
            Match each detected column to a BuildSmart field — scroll down to map both item and
            supplier columns. This applies once to the whole upload ({itemRowCount} item row
            {itemRowCount !== 1 ? "s" : ""}
            {supplierRowCount > 0 ? `, ${supplierRowCount} supplier row${supplierRowCount !== 1 ? "s" : ""}` : ""}).
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

      <div className="flex max-h-140 flex-col gap-5 overflow-y-auto pr-1">
        <Section
          title="Item Columns"
          requiredFields={ITEM_REQUIRED_FIELDS}
          optionalFields={ITEM_OPTIONAL_FIELDS}
          columns={columns}
          onUpdateMapping={onUpdateMapping}
        />
        <Section
          title="Supplier Columns"
          requiredFields={SUPPLIER_REQUIRED_FIELDS}
          optionalFields={SUPPLIER_OPTIONAL_FIELDS}
          columns={columns}
          onUpdateMapping={onUpdateMapping}
          emptyHint="No detected columns yet."
        />
      </div>

      {supplierRowCount === 0 && (
        <p className="text-xs text-gray-400">
          No file supplied supplier columns — that&apos;s fine, leave the Supplier section
          unmapped and Map &amp; Confirm&apos;s Suppliers view will show nothing to confirm.
        </p>
      )}
    </div>
  );
}
