"use client";

import { AlertTriangle } from "lucide-react";
import { supplierRowNeedsAttention, type ExtractedSupplierRow } from "@/hooks/usePricelistUpload";

const cellInputCls =
  "w-full rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20";

function EditableCell({
  value,
  missing,
  onChange,
  placeholder,
}: {
  value: string;
  missing: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  if (!missing) return <span className="text-gray-700">{value}</span>;
  return (
    <input
      value={value}
      placeholder={placeholder ?? "Missing — fill in"}
      onChange={(e) => onChange(e.target.value)}
      className={cellInputCls}
    />
  );
}

interface SupplierReviewTableProps {
  rows: ExtractedSupplierRow[];
  onUpdateRow: (rowKey: string, patch: Partial<ExtractedSupplierRow>) => void;
}

const SUPPLIER_TYPES = ["Distributor", "Warehouse", "Retailer"] as const;

// Deliberately NOT a DataTable: a supplier file describes a handful of vendors, not a big
// pricelist — a paginated 50-per-page table would be overkill here. One supplier per upload
// batch is expected (see hooks/usePricelistUpload.ts); the warning below flags if more than
// one row was detected, since only the batch's supplier gets attached to the committed prices.
export function SupplierReviewTable({ rows, onUpdateRow }: SupplierReviewTableProps) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white p-10 text-center">
        <p className="text-sm font-medium text-gray-500">No supplier file mapped</p>
        <p className="max-w-sm text-xs text-gray-400">
          No columns were mapped to the Supplier fields in Review &amp; Detect. Committed prices
          in this batch will be saved without a supplier attached.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 1 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {rows.length} supplier rows detected — only one supplier per upload batch is
          supported. Only the first row below will be attached to this batch&apos;s prices;
          remove the extra rows if this file describes multiple vendors.
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {["Supplier Name", "Address", "City", "Region", "Contact Email", "Contact Number", "Type", "Warehouse Loc.", "Status"].map(
                (h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-gray-500">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.row_key} className="border-b border-gray-50">
                <td className="px-3 py-2">
                  <EditableCell
                    value={row.supplier_name}
                    missing={!row.supplier_name.trim()}
                    onChange={(v) => onUpdateRow(row.row_key, { supplier_name: v })}
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={row.supplier_address}
                    missing={!row.supplier_address.trim()}
                    onChange={(v) => onUpdateRow(row.row_key, { supplier_address: v })}
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={row.city}
                    missing={!row.city.trim()}
                    onChange={(v) => onUpdateRow(row.row_key, { city: v })}
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={row.region}
                    missing={!row.region.trim()}
                    onChange={(v) => onUpdateRow(row.row_key, { region: v })}
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={row.contact_email}
                    missing={!row.contact_email.trim()}
                    onChange={(v) => onUpdateRow(row.row_key, { contact_email: v })}
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={row.contact_number}
                    missing={!row.contact_number.trim()}
                    onChange={(v) => onUpdateRow(row.row_key, { contact_number: v })}
                  />
                </td>
                <td className="px-3 py-2">
                  {row.supplier_type === "" ? (
                    <select
                      value=""
                      onChange={(e) => onUpdateRow(row.row_key, { supplier_type: e.target.value as ExtractedSupplierRow["supplier_type"] })}
                      className="rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs outline-none"
                    >
                      <option value="">Missing — select</option>
                      {SUPPLIER_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-700">{row.supplier_type}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500">{row.warehouse_loc || "—"}</td>
                <td className="px-3 py-2">
                  {supplierRowNeedsAttention(row) ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      Needs attention
                    </span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                      Ready
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
