"use client";

import { useEffect, useMemo, useState } from "react";
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
  // Nothing to select for a row with no historical_price_record yet (see
  // DeleteCell's own null case) — render a blank spacer, not a checkbox.
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

// Canonical catalog view — historical_price_record filtered by price_source.
// The post-upload "Saved Catalog" summary and the Published Sources post-resolution recap
// both link here instead of rendering their own full catalog table; this is the one place
// that does. A row can always be removed (deletes just that one price record, not the
// underlying Items row) — see DeleteCell. Supplier rows can also be bulk-edited (see
// isEditingAll below); DPWH/PSA stay read-only since that data is externally published.
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

  // Bulk selection/delete — mirrors Pending Review's toolbar (Select All +
  // one Delete button that targets the selection if any, otherwise every
  // selectable row currently in view). No "Approve" here: unlike Pending
  // Review, a Price Catalog row is already a saved, committed record —
  // there's nothing left to approve.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  // Global edit mode — Supplier only (see the PATCH route's own comment on
  // why DPWH/PSA never get this). Every row with a saved price record edits
  // at once, committed with one "Save All Changes" click, mirroring Pending
  // Review's global edit.
  const [isEditingAll, setIsEditingAll] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<number, SupplierRowDraft>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmingId(null);
    setDeleteError(null);
    setSelectedIds(new Set());
    setConfirmingBulkDelete(false);
    setIsEditingAll(false);
    setEditDrafts({});
    setSaveError(null);
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

  // Sequential, same rationale as AiNormalizationPanel's bulk actions — each
  // call hits its own DELETE endpoint, and this reuses the single-row
  // deletingId spinner DeleteCell already renders, one row at a time.
  const deleteRecords = async (ids: number[]) => {
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    setDeleteError(null);
    const removeOne = subTab === "dpwh" ? dpwhCatalog.remove : supplierCatalog.remove;
    let failedCount = 0;

    for (const id of ids) {
      setDeletingId(id);
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

    setDeletingId(null);
    setIsBulkDeleting(false);
    if (failedCount > 0) {
      setDeleteError(`Failed to remove ${failedCount} record${failedCount !== 1 ? "s" : ""}`);
    }
  };

  // One button, two targets — whatever's checked if anything is, otherwise
  // every selectable row currently in view (search/region-filtered).
  const handleDeleteToolbar = () => {
    if (!confirmingBulkDelete) {
      setConfirmingBulkDelete(true);
      return;
    }
    setConfirmingBulkDelete(false);
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : selectableIds;
    deleteRecords(ids).catch(() => {});
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
    [confirmingId, deletingId, selectedIds, isBulkDeleting]
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
            const draft = editDrafts[rec.historicalrec_id] ?? supplierRowToDraft(rec);
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
        accessorKey: "brand",
        header: "Brand",
        cell: ({ row }) => {
          const rec = row.original;
          if (isEditingAll && rec.historicalrec_id !== null) {
            const draft = editDrafts[rec.historicalrec_id] ?? supplierRowToDraft(rec);
            return <EditableTextCell value={draft.brand} onChange={(value) => updateSupplierDraft(rec, { brand: value })} />;
          }
          return <span>{rec.brand}</span>;
        },
      },
      {
        accessorKey: "description_material",
        header: "Description/Material",
        cell: ({ row }) => {
          const rec = row.original;
          if (isEditingAll && rec.historicalrec_id !== null) {
            const draft = editDrafts[rec.historicalrec_id] ?? supplierRowToDraft(rec);
            return (
              <EditableTextCell
                value={draft.description_material}
                onChange={(value) => updateSupplierDraft(rec, { description_material: value })}
                className="h-8 w-full min-w-[14rem] rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            );
          }
          return <span>{rec.description_material}</span>;
        },
      },
      {
        accessorKey: "unit",
        header: "Unit",
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const rec = row.original;
          if (isEditingAll && rec.historicalrec_id !== null) {
            const draft = editDrafts[rec.historicalrec_id] ?? supplierRowToDraft(rec);
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
            const draft = editDrafts[rec.historicalrec_id] ?? supplierRowToDraft(rec);
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
    [confirmingId, deletingId, selectedIds, isBulkDeleting, isEditingAll, editDrafts]
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
              ? "Supplier records can be edited or removed — this is your own catalog data."
              : "DPWH is externally published data — read-only here, but a record can still be removed."}
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        {subTab === "supplier" && (
          <button
            type="button"
            onClick={isEditingAll ? cancelEditingAll : startEditingAll}
            disabled={supplierRows.length === 0 || isBulkDeleting || isSavingAll}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            {isEditingAll ? "Cancel Editing" : "Edit"}
          </button>
        )}
        {isEditingAll && (
          <button
            type="button"
            onClick={saveAllSupplierEdits}
            disabled={isSavingAll}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSavingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {isSavingAll ? "Saving…" : "Save All Changes"}
          </button>
        )}
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
            {confirmingBulkDelete && (
              <button
                type="button"
                onClick={() => setConfirmingBulkDelete(false)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleDeleteToolbar}
              disabled={(selectedIds.size === 0 && selectableIds.length === 0) || isBulkDeleting}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                confirmingBulkDelete
                  ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {isBulkDeleting
                ? "Deleting…"
                : confirmingBulkDelete
                  ? `Confirm — delete ${selectedIds.size > 0 ? selectedIds.size : "all"}?`
                  : selectedIds.size > 0
                    ? `Delete Selected (${selectedIds.size})`
                    : "Delete"}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={active.refetch}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
      {saveError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600">
          {saveError}
        </p>
      )}

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
