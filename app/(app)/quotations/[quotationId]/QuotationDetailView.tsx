"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Award, Clock, History, Mail, MapPin, Phone, RefreshCw, Shield, Star, TrendingDown, UserRound } from "lucide-react";
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
  accepted_tier: "Practical" | "Premium" | null;
  items: QuotationItem[];
  total_material_cost: number;
  total_service_cost: number;
  grand_total: number;
  created_at: string;
  updated_at: string;
  project_location: string | null;
  client: {
    client_name: string;
    contact_person: string | null;
    contact_email: string | null;
    contact_number: string | null;
    client_address: string | null;
    notes: string | null;
    status: string | null;
  } | null;
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
  const router = useRouter();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [lockedItems, setLockedItems] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  const [showPriceChanges, setShowPriceChanges] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

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

  const isPremium = quotation.accepted_tier === "Premium";
  const tier = quotation.accepted_tier ?? "Quotation";
  const tierGradient = isPremium
    ? "project-tier-gradient bg-linear-to-r from-[#0000CD] via-[#4169E1] to-[#0000CD]"
    : "project-tier-gradient bg-linear-to-r from-primary via-orange-400 to-primary";
  const clientName = quotation.client?.client_name ?? "Client not assigned";
  const initials = clientName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CL";

  return (
    <div className="flex flex-col gap-5">
      <div className="hidden">
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

      <button type="button" onClick={() => router.push("/projects")} className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary" aria-label="Back to Open Projects">
        <ArrowLeft className="h-4 w-4" />
      </button>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <section className="flex h-full flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-sm font-bold text-primary">{initials}</div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Client Details</p><h1 className="truncate text-lg font-semibold text-gray-900">{clientName}</h1></div>
            </div>
            <span className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">{quotation.client?.status ?? quotation.status}</span>
          </div>
          <div className="grid gap-x-6 gap-y-5 py-4 sm:grid-cols-2">
            {[
              { icon: UserRound, label: "Contact Person", value: quotation.client?.contact_person },
              { icon: Mail, label: "Email", value: quotation.client?.contact_email },
              { icon: Phone, label: "Phone", value: quotation.client?.contact_number },
              { icon: MapPin, label: "Address", value: quotation.client?.client_address },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex min-w-0 items-start gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-primary"><Icon className="h-4 w-4" /></div>
                <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p><p className="mt-0.5 break-words text-sm font-medium text-gray-700">{value || "Not provided"}</p></div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
            {[["Project Name", quotation.project_name], ["Project Location", quotation.project_location || quotation.project_region]].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p><p className="mt-0.5 text-sm font-medium text-gray-700">{value}</p></div>
            ))}
          </div>
          <div className="grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Project Status", quotation.status],
              ["Region", quotation.project_region],
              ["Created", new Date(quotation.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })],
              ["Last Updated", new Date(quotation.updated_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })],
              ["Notes", quotation.client?.notes || "-"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p><p className="mt-0.5 text-sm font-medium text-gray-700">{value}</p></div>
            ))}
          </div>
        </section>

        <section className="flex h-full flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className={`${tierGradient} px-5 py-4 text-white`}>
            <div className="flex items-center justify-between"><div><span className="text-[10px] font-semibold uppercase tracking-widest opacity-80">Quote Option</span><h2 className="text-xl font-bold leading-tight">{tier}</h2></div>{isPremium ? <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" /> : <TrendingDown className="h-4 w-4 text-white/80" />}</div>
            <div className="mt-3 border-t border-white/20 pt-3"><p className="text-[10px] uppercase tracking-widest opacity-70">Total (incl. VAT): {new Date(quotation.updated_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}</p><p className="text-2xl font-extrabold">{peso(quotation.grand_total)}</p></div>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: Clock, label: "Timeline", value: "Not saved" },
                { icon: Shield, label: "Warranty", value: "Not saved" },
                { icon: Award, label: "Material Grade", value: isPremium ? "Premium" : quotation.accepted_tier === "Practical" ? "Standard" : "Not saved" },
                { icon: Clock, label: "Lifespan", value: "Not saved" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className={`rounded-xl p-2.5 ${isPremium ? "bg-[#0000CD]/5" : "bg-orange-50"}`}>
                  <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-gray-500"><Icon className={`h-3.5 w-3.5 ${isPremium ? "text-[#0000CD]" : "text-primary"}`} />{label}</p>
                  <p className="mt-0.5 text-xs font-semibold text-gray-800">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400">Finalized {new Date(quotation.updated_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}</p>
            <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500"><History className="h-3 w-3" /> Price Reference</p>
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-600">1 version</span>
              </div>
              <p className="text-xs text-gray-600">Viewing prices as of <strong>{new Date(quotation.updated_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}</strong></p>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3.5">
            <button type="button" onClick={() => setShowBreakdown(true)} className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition hover:opacity-90 ${tierGradient}`}>View Breakdown</button>
            {quotation.status === "Draft" && <Button variant="outline" className="mt-2 w-full" onClick={() => setShowRefreshConfirm(true)} disabled={isRefreshing}><RefreshCw className="h-4 w-4" /> Refresh Prices</Button>}
          </div>
        </section>
      </div>

      <Dialog open={showBreakdown} onOpenChange={setShowBreakdown}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{tier} Quotation Breakdown</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b bg-gray-50 text-gray-500"><tr><th className="px-4 py-3 text-left">Item</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Unit Cost</th><th className="px-4 py-3 text-right">Total</th></tr></thead>
              <tbody>{quotation.items.map((item) => <tr key={item.quote_item_id} className="border-b last:border-0"><td className="px-4 py-3 font-medium text-gray-900">{item.item_name}</td><td className="px-4 py-3 text-right">{item.quantity}</td><td className="px-4 py-3 text-right">{peso(item.unit_cost)}</td><td className="px-4 py-3 text-right font-semibold">{peso(item.total_cost)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-400">Materials</p><p className="mt-1 font-semibold">{peso(quotation.total_material_cost)}</p></div>
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-400">Services</p><p className="mt-1 font-semibold">{peso(quotation.total_service_cost)}</p></div>
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-400">Grand Total</p><p className="mt-1 font-semibold">{peso(quotation.grand_total)}</p></div>
          </div>
        </DialogContent>
      </Dialog>

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
