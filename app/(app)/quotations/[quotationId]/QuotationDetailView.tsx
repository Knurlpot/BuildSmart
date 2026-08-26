"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type QuotationItem = {
  quote_item_id: number;
  item_name: string;
  quantity: number;
  unit_cost: number;
  original_unit_cost: number | null;
  last_refreshed_at: string | null;
  is_price_locked: boolean;
  total_cost: number;
};

type Quotation = {
  quote_id: number;
  project_name: string;
  project_region: string;
  status: "Draft" | "Final";
  items: QuotationItem[];
  total_material_cost: number;
  created_at: string;
  updated_at: string;
};

type RefreshResult = {
  refreshed_count: number;
  locked_count: number;
  skipped_count: number;
  price_changes: Array<{
    quote_item_id: number;
    item_name: string;
    old_unit_cost: number;
    new_unit_cost: number;
    percent_change: number;
    total_cost_impact: number;
  }>;
  new_total_material_cost: number;
  total_impact: number;
};

function peso(value: number) {
  return value.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function QuotationDetailView({ quotationId }: { quotationId: string }) {
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [lockedItems, setLockedItems] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  const [showPriceChanges, setShowPriceChanges] = useState(false);

  const loadQuotation = useCallback(async () => {
    const response = await fetch(`/api/quotations/${quotationId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? "Unable to load quotation.");
    setQuotation(data);
  }, [quotationId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await loadQuotation();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load quotation.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [loadQuotation]);

  const totalPriceChange = refreshResult?.total_impact ?? 0;
  const hasSignificantChange = Math.abs(totalPriceChange) > 1000;
  const refreshedMaterialTotal = useMemo(() => refreshResult?.new_total_material_cost ?? 0, [refreshResult]);

  function toggleLock(quoteItemId: number) {
    setLockedItems((current) => {
      const next = new Set(current);
      if (next.has(quoteItemId)) next.delete(quoteItemId);
      else next.add(quoteItemId);
      return next;
    });
  }

  async function refreshPrices() {
    setIsRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`/api/quotations/${quotationId}/refresh-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked_item_ids: Array.from(lockedItems), recalculate_totals: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "Price refresh failed.");
      setRefreshResult(result);
      setShowPriceChanges(true);
      await loadQuotation();
      setLockedItems(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Price refresh failed.");
    } finally {
      setIsRefreshing(false);
      setShowRefreshConfirm(false);
    }
  }

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Loading quotation...</div>;
  if (error && !quotation) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!quotation) return null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{quotation.project_name}</h1>
          <p className="text-sm text-gray-500">
            {quotation.project_region} · Created {new Date(quotation.created_at).toLocaleDateString()}
          </p>
        </div>
        {quotation.status === "Draft" && (
          <Button onClick={() => setShowRefreshConfirm(true)} disabled={isRefreshing}>
            <RefreshCw className="h-4 w-4" /> Refresh Prices
          </Button>
        )}
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Item</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Unit Cost</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-left">Updated</th>
              <th className="px-4 py-2 text-center">Lock</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item) => (
              <tr key={item.quote_item_id} className="border-b last:border-0">
                <td className="px-4 py-2 font-medium text-gray-900">{item.item_name}</td>
                <td className="px-4 py-2 text-right">{item.quantity}</td>
                <td className="px-4 py-2 text-right">{peso(item.unit_cost)}</td>
                <td className="px-4 py-2 text-right font-semibold">{peso(item.total_cost)}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {item.last_refreshed_at ? new Date(item.last_refreshed_at).toLocaleDateString() : "Original"}
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => toggleLock(item.quote_item_id)}
                    className={`rounded p-1 ${item.is_price_locked || lockedItems.has(item.quote_item_id) ? "bg-blue-50 text-blue-600" : "text-gray-400"}`}
                    aria-label="Toggle price refresh lock"
                  >
                    <Lock className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t pt-4 text-right text-sm text-gray-600">
        Total Material Cost: <strong className="text-gray-900">{peso(quotation.total_material_cost)}</strong>
      </div>

      <Dialog open={showRefreshConfirm} onOpenChange={setShowRefreshConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refresh Quotation Prices</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Latest supplier prices will be applied to unlocked items.</p>
            <div className="space-y-2">
              {quotation.items.map((item) => (
                <label key={item.quote_item_id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={lockedItems.has(item.quote_item_id)} onChange={() => toggleLock(item.quote_item_id)} />
                  {item.item_name}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={refreshPrices} disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh Prices"}
              </Button>
              <Button variant="outline" onClick={() => setShowRefreshConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPriceChanges} onOpenChange={setShowPriceChanges}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Price Refresh Results</DialogTitle>
          </DialogHeader>
          {refreshResult && (
            <div className="space-y-4">
              {hasSignificantChange && (
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  Total change is {peso(Math.abs(totalPriceChange))} {totalPriceChange > 0 ? "higher" : "lower"}.
                </div>
              )}
              <div className="grid gap-2 rounded bg-gray-50 p-3 text-sm sm:grid-cols-3">
                <span>Updated: {refreshResult.refreshed_count}</span>
                <span>Locked: {refreshResult.locked_count}</span>
                <span>Skipped: {refreshResult.skipped_count}</span>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {refreshResult.price_changes.map((change) => (
                  <div key={change.quote_item_id} className="rounded border p-2 text-sm">
                    <div className="font-medium">{change.item_name}</div>
                    <div className="text-xs text-gray-600">
                      {peso(change.old_unit_cost)} to {peso(change.new_unit_cost)} ({change.percent_change > 0 ? "+" : ""}
                      {change.percent_change.toFixed(1)}%)
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
                New material total: <strong>{peso(refreshedMaterialTotal)}</strong>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
