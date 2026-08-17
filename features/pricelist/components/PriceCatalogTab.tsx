"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Pencil, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { DataTable } from "@/components/data-table/DataTable";
import { usePricelistPublishedSource, type DpwhCatalogRow } from "@/hooks/usePricelistPublishedSource";
import { usePricelistCatalog, type SavedPriceRecord, type SupplierCatalogEdit } from "@/hooks/usePricelistCatalog";
import { REGIONS } from "@/lib/regions";

function fmt(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function SelectCell({
  id,
  isSelected,
  disabled,
  onToggle,
}: {
  id: number | null;
  isSelected: boolean;
  disabled: boolean;
  onToggle: (id: number) => void;
}) {
  // Nothing to select for a row with no historical_price_record yet — render
  // a blank spacer, not a checkbox.
  if (id === null) {
    return <span className="block h-4 w-4" aria-hidden />;
  }
  return (
    <input
      type="checkbox"
      checked={isSelected}
      disabled={disabled}
      onChange={() => onToggle(id)}
      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="Select this price record"
    />
  );
}

// Supplier-only: DPWH/PSA are externally published data and stay read-only
// (see the PATCH route's own comment for why the scope stops here).
type SupplierRowDraft = {
  item_name: string;
  brand: string;
  description_material: string;
  unit: string;
  price: string;
};

function supplierRowToDraft(row: SavedPriceRecord): SupplierRowDraft {
  return {
    item_name: row.item_name,
    brand: row.brand,
    description_material: row.description_material,
    unit: row.unit,
    price: String(row.price),
  };
}

function supplierDraftToPatch(draft: SupplierRowDraft): SupplierCatalogEdit {
  return {
    item_name: draft.item_name.trim(),
    brand: draft.brand.trim(),
    description: draft.description_material.trim(),
    unit: draft.unit.trim(),
    price: Number(draft.price),
  };
}

function EditableTextCell({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "h-8 w-full min-w-[7rem] rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
      }
    />
  );
}

// 
export function PriceCatalogTab() {
  const [subTab, setSubTab] = useState<"dpwh" | "supplier">("dpwh");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("All");
  const [category, setCategory] = useState("All");

  const { dpwhCatalog } = usePricelistPublishedSource();
  const supplierCatalog = usePricelistCatalog();

  const dpwhLoad = dpwhCatalog.load;
  const supplierLoad = supplierCatalog.load;
  useEffect(() => {
    if (subTab === "dpwh") dpwhLoad();
    else supplierLoad();
  }, [subTab, dpwhLoad, supplierLoad]);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Bulk selection/delete 
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // 
  const [isEditingAll, setIsEditingAll] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<number, SupplierRowDraft>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 
  const editDraftsRef = useRef(editDrafts);
  editDraftsRef.current = editDrafts;

  useEffect(() => {
    setDeleteError(null);
    setSelectedIds(new Set());
    setIsEditingAll(false);
    setEditDrafts({});
    setSaveError(null);
    setCategory("All");
  }, [subTab]);

  const dpwhRows = useMemo(
    () =>
      dpwhCatalog.records.filter(
        (r) =>
          (region === "All" || r.region === region) &&
          (category === "All" || (r.category_type ?? "Uncategorized") === category)
      ),
    [dpwhCatalog.records, region, category]
  );
  const supplierRows = useMemo(
    () =>
      supplierCatalog.records.filter(
        (r) => category === "All" || (r.category_type ?? "Uncategorized") === category
      ),
    [supplierCatalog.records, category]
  );
  const categoryOptions = useMemo(() => {
    const rows = subTab === "dpwh" ? dpwhCatalog.records : supplierCatalog.records;
    return Array.from(new Set(rows.map((r) => r.category_type ?? "Uncategorized"))).sort();
  }, [subTab, dpwhCatalog.records, supplierCatalog.records]);

  // Rows in the currently active sub-tab's (region/region-filtered) view that
  // actually have a record to select — excludes a Supplier row with no
  // historical_price_record yet (historicalrec_id null, see SelectCell).
  const selectableIds = useMemo(() => {
    const rows = subTab === "dpwh" ? dpwhRows : supplierRows;
    return rows
      .map((r) => r.historicalrec_id)
      .filter((id): id is number => id !== null);
  }, [subTab, dpwhRows, supplierRows]);

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Sequential, same rationale as AiNormalizationPanel's bulk actions: each
  // selected record hits its own DELETE endpoint.
  const deleteRecords = async (ids: number[]) => {
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    setDeleteError(null);
    const removeOne = subTab === "dpwh" ? dpwhCatalog.remove : supplierCatalog.remove;
    let failedCount = 0;

    for (const id of ids) {
      try {
        await removeOne(id);
      } catch {
        failedCount += 1;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }

    setIsBulkDeleting(false);
    if (failedCount > 0) {
      setDeleteError(`Failed to remove ${failedCount} record${failedCount !== 1 ? "s" : ""}`);
    }
  };

  // Delete only acts on explicitly selected rows; the toolbar icon stays
  // disabled until the user checks at least one record.
  const handleDeleteToolbar = () => {
    if (selectedIds.size === 0) return;
    deleteRecords(Array.from(selectedIds)).catch(() => {});
  };

  // Seeds every currently-visible Supplier row's draft (skipping rows with
  // no price record yet — nothing there to edit, see EditableTextCell usage
  // below) and switches every one of them into the editing layout at once.
  const startEditingAll = () => {
    setSaveError(null);
    const drafts: Record<number, SupplierRowDraft> = {};
    supplierRows.forEach((row) => {
      if (row.historicalrec_id !== null) {
        drafts[row.historicalrec_id] = supplierRowToDraft(row);
      }
    });
    setEditDrafts(drafts);
    setIsEditingAll(true);
  };

  const cancelEditingAll = () => {
    setIsEditingAll(false);
    setEditDrafts({});
    setSaveError(null);
  };

  const updateSupplierDraft = (row: SavedPriceRecord, patch: Partial<SupplierRowDraft>) => {
    if (row.historicalrec_id === null) return;
    const id = row.historicalrec_id;
    setEditDrafts((prev) => {
      const current = prev[id] ?? supplierRowToDraft(row);
      return { ...prev, [id]: { ...current, ...patch } };
    });
  };

  // Commits every edited row's draft in one shot. Exits edit mode only once
  // every row has saved — a failure stays editable so nothing typed is lost.
  const saveAllSupplierEdits = async () => {
    setIsSavingAll(true);
    setSaveError(null);
    const failedNames: string[] = [];

    for (const row of supplierRows) {
      if (row.historicalrec_id === null) continue;
      const draft = editDrafts[row.historicalrec_id] ?? supplierRowToDraft(row);
      setSavingId(row.historicalrec_id);
      try {
        await supplierCatalog.update(row.historicalrec_id, supplierDraftToPatch(draft));
      } catch (err) {
        failedNames.push(row.item_name);
      }
    }

    setSavingId(null);
    setIsSavingAll(false);
    if (failedNames.length > 0) {
      setSaveError(`Failed to save: ${failedNames.join(", ")}`);
    } else {
      setIsEditingAll(false);
      setEditDrafts({});
    }
  };

  const dpwhColumns = useMemo<ColumnDef<DpwhCatalogRow>[]>(
    () => [
      {
        id: "__select",
        header: "",
        enableGlobalFilter: false,
        enableSorting: false,
        cell: ({ row }) => (
          <SelectCell
            id={row.original.historicalrec_id}
            isSelected={selectedIds.has(row.original.historicalrec_id)}
            disabled={isBulkDeleting}
            onToggle={toggleSelectOne}
          />
        ),
      },
      {
        accessorKey: "item_name",
        header: "Material",
        cell: ({ row }) => (
          <span className="font-medium text-gray-800">
            {row.original.item_name ?? `Item #${row.original.item_code}`}
          </span>
        ),
      },
      {
        accessorKey: "category_type",
        header: "Category",
        cell: ({ row }) => <span>{row.original.category_type ?? "Uncategorized"}</span>,
      },
      { accessorKey: "region", header: "Region", enableGlobalFilter: false },
      { accessorKey: "location", header: "Location", enableGlobalFilter: false },
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
        accessorKey: "effective_date",
        header: "Effective",
        enableGlobalFilter: false,
        cell: ({ getValue }) => <span className="text-gray-500">{formatDate(getValue<string>())}</span>,
      },
    ],
    [selectedIds, isBulkDeleting]
  );

  const supplierColumns = useMemo<ColumnDef<SavedPriceRecord>[]>(
    () => [
      {
        id: "__select",
        header: "",
        enableGlobalFilter: false,
        enableSorting: false,
        cell: ({ row }) => (
          <SelectCell
            id={row.original.historicalrec_id}
            isSelected={row.original.historicalrec_id !== null && selectedIds.has(row.original.historicalrec_id)}
            disabled={isBulkDeleting || isEditingAll}
            onToggle={toggleSelectOne}
          />
        ),
      },
      {
        accessorKey: "item_name",
        header: "Item Name",
        cell: ({ row }) => {
          const rec = row.original;
          if (isEditingAll && rec.historicalrec_id !== null) {
            const draft = editDraftsRef.current[rec.historicalrec_id] ?? supplierRowToDraft(rec);
            return (
              <EditableTextCell
                value={draft.item_name}
                onChange={(value) => updateSupplierDraft(rec, { item_name: value })}
                className="h-8 w-full min-w-[12rem] rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            );
          }
          return <span className="font-medium text-gray-800">{rec.item_name}</span>;
        },
      },
      {
        accessorKey: "supplier_name",
        header: "Supplier",
        cell: ({ row }) => <span className="text-gray-700">{row.original.supplier_name ?? "Unassigned"}</span>,
      },
      {
        accessorKey: "brand",
        header: "Brand",
        cell: ({ row }) => {
          const rec = row.original;
          if (isEditingAll && rec.historicalrec_id !== null) {
            const draft = editDraftsRef.current[rec.historicalrec_id] ?? supplierRowToDraft(rec);
            return <EditableTextCell value={draft.brand} onChange={(value) => updateSupplierDraft(rec, { brand: value })} />;
          }
          return <span>{rec.brand}</span>;
        },
      },
      {
        accessorKey: "category_type",
        header: "Category",
        cell: ({ row }) => <span>{row.original.category_type ?? "Uncategorized"}</span>,
      },
      {
        accessorKey: "description_material",
        header: "Description/Material",
        cell: ({ row }) => {
          const rec = row.original;
          if (isEditingAll && rec.historicalrec_id !== null) {
            const draft = editDraftsRef.current[rec.historicalrec_id] ?? supplierRowToDraft(rec);
            return (
              <EditableTextCell
                value={draft.description_material}
                onChange={(value) => updateSupplierDraft(rec, { description_material: value })}
                className="h-8 w-full min-w-[14rem] rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            );
          }
          return <span>{rec.description_material || ""}</span>;
        },
      },
      {
        accessorKey: "unit",
        header: "Unit",
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const rec = row.original;
          if (isEditingAll && rec.historicalrec_id !== null) {
            const draft = editDraftsRef.current[rec.historicalrec_id] ?? supplierRowToDraft(rec);
            return (
              <EditableTextCell
                value={draft.unit}
                onChange={(value) => updateSupplierDraft(rec, { unit: value })}
                className="h-8 w-20 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            );
          }
          return <span>{rec.unit}</span>;
        },
      },
      {
        accessorKey: "price",
        header: "Price",
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const rec = row.original;
          if (isEditingAll && rec.historicalrec_id !== null) {
            const draft = editDraftsRef.current[rec.historicalrec_id] ?? supplierRowToDraft(rec);
            return (
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={draft.price}
                onChange={(e) => updateSupplierDraft(rec, { price: e.target.value })}
                className="h-8 w-28 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            );
          }
          return <span className="font-semibold text-gray-900">{fmt(rec.price)}</span>;
        },
      },
      {
        accessorKey: "effective_date",
        header: "Effective",
        enableGlobalFilter: false,
        cell: ({ getValue }) => <span className="text-gray-500">{formatDate(getValue<string>())}</span>,
      },
    ],
    // editDrafts is deliberately NOT a dep — see editDraftsRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, isBulkDeleting, isEditingAll]
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
            {subTab === "supplier"
              ? "Supplier records - only you can modify these records."
              : "DPWH is externally published data."}
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

      {saveError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600">
          {saveError}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-4">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by material…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="min-w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option>All</option>
              {categoryOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
          {subTab === "dpwh" && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500">Region</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="min-w-36 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                {REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
          <span className="ml-auto text-xs text-gray-400">
            {active.count} record{active.count !== 1 ? "s" : ""}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isEditingAll && (
              <>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  disabled={selectableIds.length === 0 || isBulkDeleting}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {allSelected ? "Deselect All" : "Select All"}
                </button>
                {subTab === "supplier" && (
                  <button
                    type="button"
                    onClick={startEditingAll}
                    disabled={supplierRows.length === 0 || isBulkDeleting || isSavingAll}
                    aria-label="Edit"
                    title="Edit"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDeleteToolbar}
                  disabled={selectedIds.size === 0 || isBulkDeleting}
                  aria-label={
                    isBulkDeleting
                      ? "Deleting…"
                      : selectedIds.size > 0
                        ? `Delete selected (${selectedIds.size})`
                        : "Select records to delete"
                  }
                  title={
                    isBulkDeleting
                      ? "Deleting…"
                      : selectedIds.size > 0
                        ? `Delete selected (${selectedIds.size})`
                        : "Select records to delete"
                  }
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
            {isEditingAll && (
              <>
                <button
                  type="button"
                  onClick={cancelEditingAll}
                  disabled={isSavingAll}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel Editing
                </button>
                <button
                  type="button"
                  onClick={saveAllSupplierEdits}
                  disabled={isSavingAll}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {isSavingAll ? "Saving…" : "Save All Changes"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={active.refetch}
              aria-label="Refresh"
              title="Refresh"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <QueryState
          isLoading={active.isLoading}
          error={active.error}
          isEmpty={!active.isLoading && !active.error && active.count === 0}
          onRetry={active.refetch}
          emptyTitle={subTab === "dpwh" ? "No DPWH-sourced records yet" : "No supplier-sourced records yet"}
          emptyHint={undefined}
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
