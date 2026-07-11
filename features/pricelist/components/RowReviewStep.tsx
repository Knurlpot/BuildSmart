"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import PricelistTable from "./PricelistTable";
import { SupplierReviewTable } from "./SupplierReviewTable";
import {
  itemRowNeedsAttention,
  supplierRowNeedsAttention,
  SOFT_ROW_CAP,
  type ExtractedItemRow,
  type ExtractedSupplierRow,
} from "@/hooks/usePricelistUpload";

interface RowReviewStepProps {
  itemRows: ExtractedItemRow[];
  onUpdateItemRow: (rowKey: string, patch: Partial<ExtractedItemRow>) => void;
  onRemoveItemRow: (rowKey: string) => void;
  supplierRows: ExtractedSupplierRow[];
  onUpdateSupplierRow: (rowKey: string, patch: Partial<ExtractedSupplierRow>) => void;
  onBack: () => void;
  onApprove: () => void;
  isCommitting: boolean;
  commitError: Error | null;
}

export function RowReviewStep({
  itemRows,
  onUpdateItemRow,
  onRemoveItemRow,
  supplierRows,
  onUpdateSupplierRow,
  onBack,
  onApprove,
  isCommitting,
  commitError,
}: RowReviewStepProps) {
  const [view, setView] = useState<"items" | "suppliers">("items");
  const [attentionOnly, setAttentionOnly] = useState(false);

  const itemAttentionCount = useMemo(() => itemRows.filter(itemRowNeedsAttention).length, [itemRows]);
  const visibleItemRows = useMemo(
    () => (attentionOnly ? itemRows.filter(itemRowNeedsAttention) : itemRows),
    [itemRows, attentionOnly]
  );
  const supplierAttentionCount = useMemo(
    () => supplierRows.filter(supplierRowNeedsAttention).length,
    [supplierRows]
  );
  const totalAttentionCount = itemAttentionCount + supplierAttentionCount;
  const overCap = itemRows.length > SOFT_ROW_CAP;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Map &amp; Confirm</h2>
          <p className="text-xs text-gray-500">
            Review each row, fill in anything missing, then approve. Already-filled cells are
            read-only — you&apos;re confirming, not re-editing.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
      </div>

      {overCap && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This upload implies more than {SOFT_ROW_CAP.toLocaleString()} rows — large uploads
          should be chunked server-side. Review the sample below before approving.
        </div>
      )}

      <div className="flex w-fit gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
        {(
          [
            { id: "items" as const, label: `View Items (${itemRows.length})` },
            { id: "suppliers" as const, label: `View Suppliers (${supplierRows.length})` },
          ]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            className={`rounded-lg px-4 py-1.5 text-xs font-bold transition ${
              view === tab.id ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === "items" ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-600">
              <strong>{itemRows.length}</strong> item row{itemRows.length !== 1 ? "s" : ""} total
            </p>
            {itemAttentionCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                {itemAttentionCount} need{itemAttentionCount !== 1 ? "" : "s"} attention
              </span>
            )}
            <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={attentionOnly}
                onChange={(e) => setAttentionOnly(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-primary"
              />
              Show only rows needing attention
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <PricelistTable rows={visibleItemRows} onUpdateRow={onUpdateItemRow} onRemoveRow={onRemoveItemRow} />
          </div>
        </>
      ) : (
        <SupplierReviewTable rows={supplierRows} onUpdateRow={onUpdateSupplierRow} />
      )}

      {commitError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t save this pricelist: {commitError.message}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={isCommitting || totalAttentionCount > 0}
          className="w-fit rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
        >
          {isCommitting ? "Saving…" : `Approve & Save ${itemRows.length} Records`}
        </button>
        {totalAttentionCount > 0 && (
          <p className="text-xs text-gray-400">
            Resolve all flagged rows before approving
            {supplierAttentionCount > 0 && itemAttentionCount > 0
              ? " (in both Items and Suppliers)"
              : supplierAttentionCount > 0
                ? " (see Suppliers)"
                : ""}
            .
          </p>
        )}
      </div>
    </div>
  );
}
