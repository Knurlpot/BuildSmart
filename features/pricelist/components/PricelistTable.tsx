"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";
import { DataTable } from "@/components/data-table/DataTable";
import { itemRowNeedsAttention, type ExtractedItemRow } from "@/hooks/usePricelistUpload";

const cellInputCls =
  "w-full rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20";

interface PricelistTableProps {
  rows: ExtractedItemRow[];
  onUpdateRow: (rowKey: string, patch: Partial<ExtractedItemRow>) => void;
  onRemoveRow: (rowKey: string) => void;
}

/**
 * Editable-only-if-missing: a cell renders as an input ONLY when its value is absent/invalid.
 * Already-filled cells render as plain text — this step is for confirming, not re-editing
 * every row the backend already parsed correctly.
 */
function EditableCell({
  value,
  missing,
  onChange,
  type = "text",
  placeholder,
}: {
  value: string | number;
  missing: boolean;
  onChange: (v: string) => void;
  type?: "text" | "number";
  placeholder?: string;
}) {
  if (!missing) {
    return <span className="text-gray-700">{value}</span>;
  }
  return (
    <input
      type={type}
      placeholder={placeholder ?? "Missing — fill in"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cellInputCls}
    />
  );
}

export default function PricelistTable({ rows, onUpdateRow, onRemoveRow }: PricelistTableProps) {
  // Optional fields (quality, size_width, size_length, color, description) aren't shown as
  // columns here — this compact view surfaces the required item + price fields only, matching
  // what actually gates approval. No Supplier column: supplier attribution is batch-level (one
  // supplier per upload), not per-row — see hooks/usePricelistUpload.ts.
  const columns = useMemo<ColumnDef<ExtractedItemRow>[]>(
    () => [
      {
        accessorKey: "item_name",
        header: "Item Name",
        cell: ({ row }) => (
          <EditableCell
            value={row.original.item_name}
            missing={!row.original.item_name.trim()}
            onChange={(v) => onUpdateRow(row.original.row_key, { item_name: v })}
          />
        ),
      },
      {
        accessorKey: "material",
        header: "Material",
        cell: ({ row }) => (
          <EditableCell
            value={row.original.material}
            missing={!row.original.material.trim()}
            onChange={(v) => onUpdateRow(row.original.row_key, { material: v })}
          />
        ),
      },
      {
        accessorKey: "brand",
        header: "Brand",
        cell: ({ row }) => (
          <EditableCell
            value={row.original.brand}
            missing={!row.original.brand.trim()}
            onChange={(v) => onUpdateRow(row.original.row_key, { brand: v })}
          />
        ),
      },
      {
        accessorKey: "unit",
        header: "Unit",
        cell: ({ row }) => (
          <EditableCell
            value={row.original.unit}
            missing={!row.original.unit.trim()}
            onChange={(v) => onUpdateRow(row.original.row_key, { unit: v })}
          />
        ),
      },
      {
        accessorKey: "category_id",
        header: "Category",
        cell: ({ row }) => (
          <EditableCell
            type="number"
            placeholder="Category ID"
            value={row.original.category_id ?? ""}
            missing={row.original.category_id === null}
            onChange={(v) =>
              onUpdateRow(row.original.row_key, {
                category_id: v === "" ? null : Number(v),
                needs_mapping: v === "",
              })
            }
          />
        ),
      },
      {
        accessorKey: "item_source",
        header: "Item Source",
        enableGlobalFilter: false,
        cell: ({ row }) => <span className="text-gray-500">{row.original.item_source}</span>,
      },
      {
        accessorKey: "price",
        header: "Price",
        cell: ({ row }) => (
          <EditableCell
            type="number"
            value={row.original.price}
            missing={row.original.price <= 0}
            onChange={(v) => onUpdateRow(row.original.row_key, { price: Number(v) })}
          />
        ),
      },
      {
        id: "status",
        header: "Status",
        enableGlobalFilter: false,
        cell: ({ row }) =>
          itemRowNeedsAttention(row.original) ? (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
              Needs attention
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
              Ready
            </span>
          ),
      },
      {
        id: "actions",
        header: "",
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onRemoveRow(row.original.row_key)}
            title="Reject / remove this row"
            className="rounded p-1 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
          >
            <X className="h-3 w-3" />
          </button>
        ),
      },
    ],
    [onUpdateRow, onRemoveRow]
  );

  return <DataTable columns={columns} data={rows} enablePagination pageSize={50} compact />;
}
