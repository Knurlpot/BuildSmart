"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Search, Trash2 } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { DataTable } from "@/components/data-table/DataTable";
import { usePricelistPublishedSource, type DpwhCatalogRow } from "@/hooks/usePricelistPublishedSource";
import { usePricelistCatalog, type SavedPriceRecord } from "@/hooks/usePricelistCatalog";
import { REGIONS } from "@/lib/regions";

function fmt(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function DeleteCell({
  id,
  confirmingId,
  deletingId,
  onConfirm,
  onStartConfirm,
  onCancel,
}: {
  id: number | null;
  confirmingId: number | null;
  deletingId: number | null;
  onConfirm: (id: number) => void;
  onStartConfirm: (id: number) => void;
  onCancel: () => void;
}) {
  if (id === null) {
    return (
      <span className="text-xs text-gray-300" title="No price record saved for this item yet">
        —
      </span>
    );
  }

  const isConfirming = confirmingId === id;
  const isDeleting = deletingId === id;

  if (isConfirming) {
    return (
      <div className="flex justify-end gap-1">
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => onConfirm(id)}
          className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={onCancel}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => onStartConfirm(id)}
        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
        aria-label="Remove this price record"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Canonical catalog view — historical_price_record filtered by price_source.
// The post-upload "Saved Catalog" summary and the Published Sources post-resolution recap
// both link here instead of rendering their own full catalog table; this is the one place
// that does. Values aren't editable here, but a row can be removed (deletes just that one
// price record, not the underlying Items row) — see DeleteCell.
export function PriceCatalogTab() {
  const [subTab, setSubTab] = useState<"dpwh" | "supplier">("dpwh");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("All");

  const { dpwhCatalog } = usePricelistPublishedSource();
  const supplierCatalog = usePricelistCatalog();

  const dpwhLoad = dpwhCatalog.load;
  const supplierLoad = supplierCatalog.load;
  useEffect(() => {
    if (subTab === "dpwh") dpwhLoad();
    else supplierLoad();
  }, [subTab, dpwhLoad, supplierLoad]);

  // Two-click inline confirm per row (matches the pattern used for "Clear" in
  // AiNormalizationPanel) rather than a native confirm() dialog — deletes only
  // the one historical_price_record shown, not the underlying Items row.
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmingId(null);
    setDeleteError(null);
  }, [subTab]);

  const handleDeleteDpwh = async (historicalrecId: number) => {
    setDeletingId(historicalrecId);
    setDeleteError(null);
    try {
      await dpwhCatalog.remove(historicalrecId);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  };

  const handleDeleteSupplier = async (historicalrecId: number) => {
    setDeletingId(historicalrecId);
    setDeleteError(null);
    try {
      await supplierCatalog.remove(historicalrecId);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  };

  const dpwhRows = useMemo(
    () => dpwhCatalog.records.filter((r) => region === "All" || r.region === region),
    [dpwhCatalog.records, region]
  );
  const supplierRows = useMemo(
    () => supplierCatalog.records.filter((r) => region === "All" || r.region === region),
    [supplierCatalog.records, region]
  );

  const dpwhColumns = useMemo<ColumnDef<DpwhCatalogRow>[]>(
    () => [
      {
        accessorKey: "item_name",
        header: "Material",
        cell: ({ row }) => (
          <span className="font-medium text-gray-800">
            {row.original.item_name ?? `Item #${row.original.item_code}`}
          </span>
        ),
      },
      { accessorKey: "region", header: "Region", enableGlobalFilter: false },
      {
        id: "period",
        header: "Period",
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <span className="text-gray-500">
            {row.original.quarter} {row.original.year}
          </span>
        ),
      },
      {
        accessorKey: "price",
        header: "Price",
        enableGlobalFilter: false,
        cell: ({ getValue }) => <span className="font-semibold text-gray-900">{fmt(getValue<number>())}</span>,
      },
      {
        id: "__delete",
        header: "",
        enableGlobalFilter: false,
        enableSorting: false,
        cell: ({ row }) => (
          <DeleteCell
            id={row.original.historicalrec_id}
            confirmingId={confirmingId}
            deletingId={deletingId}
            onConfirm={handleDeleteDpwh}
            onStartConfirm={setConfirmingId}
            onCancel={() => setConfirmingId(null)}
          />
        ),
      },
    ],
    [confirmingId, deletingId]
  );

  const supplierColumns = useMemo<ColumnDef<SavedPriceRecord>[]>(
    () => [
      {
        accessorKey: "item_name",
        header: "Item Name",
        cell: ({ row }) => <span className="font-medium text-gray-800">{row.original.item_name}</span>,
      },
      { accessorKey: "brand", header: "Brand" },
      {
        accessorKey: "description_material",
        header: "Description/Material",
      },
      { accessorKey: "unit", header: "Unit", enableGlobalFilter: false },
      {
        accessorKey: "price",
        header: "Price",
        enableGlobalFilter: false,
        cell: ({ getValue }) => <span className="font-semibold text-gray-900">{fmt(getValue<number>())}</span>,
      },
      {
        id: "__delete",
        header: "",
        enableGlobalFilter: false,
        enableSorting: false,
        cell: ({ row }) => (
          <DeleteCell
            id={row.original.historicalrec_id}
            confirmingId={confirmingId}
            deletingId={deletingId}
            onConfirm={handleDeleteSupplier}
            onStartConfirm={setConfirmingId}
            onCancel={() => setConfirmingId(null)}
          />
        ),
      },
    ],
    [confirmingId, deletingId]
  );

  const active = subTab === "dpwh"
    ? { isLoading: dpwhCatalog.isLoading, error: dpwhCatalog.error, refetch: dpwhCatalog.refetch, count: dpwhRows.length }
    : { isLoading: supplierCatalog.isLoading, error: supplierCatalog.error, refetch: supplierCatalog.refetch, count: supplierRows.length };

  return (
    <div className="flex flex-col gap-5">
      {deleteError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600">
          Couldn&apos;t remove that record: {deleteError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Price Catalog</h2>
          <p className="text-xs text-gray-500">
            The canonical view of your saved price records — values aren&apos;t editable here, but a
            record can be removed.
          </p>
        </div>
        <div className="flex w-fit gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
          {(
            [
              { id: "dpwh" as const, label: "DPWH" },
              { id: "supplier" as const, label: "Supplier" },
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`rounded-lg px-5 py-1.5 text-xs font-bold transition ${
                subTab === tab.id ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="relative min-w-50 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by material…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          >
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <span className="ml-auto text-xs text-gray-400">
          {active.count} record{active.count !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <QueryState
          isLoading={active.isLoading}
          error={active.error}
          isEmpty={!active.isLoading && !active.error && active.count === 0}
          onRetry={active.refetch}
          emptyTitle={subTab === "dpwh" ? "No DPWH-sourced records yet" : "No supplier-sourced records yet"}
          emptyHint={
            subTab === "dpwh"
              ? "Populates once a DPWH fetch in Published Sources has saved records."
              : "Populates once a Supplier pricelist upload has been approved."
          }
          minHeight={260}
        >
          {subTab === "dpwh" ? (
            <DataTable columns={dpwhColumns} data={dpwhRows} globalFilter={search} compact enablePagination pageSize={50} />
          ) : (
            <DataTable columns={supplierColumns} data={supplierRows} globalFilter={search} compact enablePagination pageSize={50} />
          )}
        </QueryState>
      </div>
    </div>
  );
}
