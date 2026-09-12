"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Award, Clock, History, Mail, MapPin, Phone, RefreshCw, Shield, Star, TrendingDown, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuotationBreakdownModal } from "@/features/quotation-generation/components/QuotationBreakdownModal";
import type { DraftSegment } from "@/features/quotation-generation/lib/draftSegment";
import type { BlueprintFloor } from "@/lib/dev/provisional/quotationGenerationTypes";
import type {
  ItemCategory,
  PricelistBasis,
  ProvisionalItemLine,
  ProvisionalQuotationTierResult,
  ProvisionalTier,
} from "@/lib/dev/provisional/quotationBreakdownTypes";

type QuotationItem = {
  quote_item_id: number;
  source_type?: "DPWH" | "PSA" | "Supplier" | "Internal";
  supplier_id?: number | null;
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
  user_id: number;
  project_name: string;
  project_region: string;
  status: "Draft" | "Final";
  accepted_tier: "Practical" | "Premium" | null;
  items: QuotationItem[];
  total_material_cost: number;
  total_service_cost: number;
  grand_total: number;
  finalized_breakdown_snapshot: {
    tier?: ProvisionalTier;
    version_number?: number;
    finalized_at?: string;
    result?: ProvisionalQuotationTierResult;
    pricelist_basis_at_finalize?: PricelistBasis;
    pricelistBasis?: PricelistBasis;
    segments?: DraftSegment[];
    blueprintFloors?: BlueprintFloor[] | null;
  } | null;
  finalized_breakdown_versions?: Array<NonNullable<Quotation["finalized_breakdown_snapshot"]>>;
  created_at: string;
  updated_at: string;
  created_by_user_name: string | null;
  created_by_user_email: string | null;
  updated_by_user_name: string | null;
  updated_by_user_email: string | null;
  project_location: string | null;
  client: {
    client_id: number;
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

type ErrorResponse = {
  error?: string;
};

function peso(value: number) {
  return value.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function parseJsonOrNull(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const SAVED_QUOTATION_PRICELIST_BASIS: PricelistBasis = "Uploaded";
const SAVED_QUOTATION_VAT_RATE = 12;
const LEGACY_TIER_LABELS: Record<ProvisionalTier, Pick<ProvisionalQuotationTierResult, "timeline_label" | "warranty_label" | "lifespan_label" | "material_grade_label">> = {
  Practical: {
    timeline_label: "8-10 weeks",
    warranty_label: "1-year workmanship",
    lifespan_label: "Not set",
    material_grade_label: "Standard Grade",
  },
  Premium: {
    timeline_label: "5-7 weeks",
    warranty_label: "3-year comprehensive",
    lifespan_label: "Not set",
    material_grade_label: "Premium / Imported Grade",
  },
};

function getSavedQuotationTier(tier: Quotation["accepted_tier"]): ProvisionalTier {
  return tier === "Premium" ? "Premium" : "Practical";
}

function getSavedItemCategory(itemName: string): ItemCategory {
  const normalized = itemName.toLowerCase();
  return normalized.includes("labor") || normalized.includes("labour") ? "Labor" : "Material";
}

function toSavedBreakdownLine(item: QuotationItem): ProvisionalItemLine {
  const category = getSavedItemCategory(item.item_name);

  return {
    line_id: `saved-quote-item-${item.quote_item_id}`,
    segment_draft_id: "saved-finalized-quotation",
    segment_name: "Legacy finalized items",
    floor_level: "Segment details not saved",
    treatment_type: null,
    category,
    item_code: `QUOTE-${item.quote_item_id}`,
    item_name: item.item_name,
    unit: "unit",
    derived_area_sqm: null,
    derived_coverage_per_sqm: null,
    derived_wastage_percentage: null,
    quantity: item.quantity,
    unit_price: item.unit_cost,
    total_cost: item.total_cost,
    source_type: SAVED_QUOTATION_PRICELIST_BASIS,
    is_overridden: item.is_price_locked,
    pricing_reference: {
      price_source: item.source_type ?? "Internal",
      region: null,
      brand: null,
      quarter: null,
      year: null,
      recorded_at: item.last_refreshed_at,
      confidence: null,
    },
    supplier_options: [],
    selected_supplier_id: null,
  };
}

function createSavedBreakdownResult(quotation: Quotation, tier: ProvisionalTier): ProvisionalQuotationTierResult {
  const items = quotation.items.map(toSavedBreakdownLine);
  const tierLabels = LEGACY_TIER_LABELS[tier];
  const laborCost = items
    .filter((item) => item.category === "Labor")
    .reduce((sum, item) => sum + (item.total_cost ?? 0), 0);
  const serviceSubtotal = quotation.total_service_cost;
  const knownSubtotal = quotation.total_material_cost + quotation.total_service_cost;
  const vatBaseFromGrandTotal = quotation.grand_total / (1 + SAVED_QUOTATION_VAT_RATE / 100);
  const vatAmount = Math.max(quotation.grand_total - vatBaseFromGrandTotal, 0);
  const profitAmount = Math.max(vatBaseFromGrandTotal - knownSubtotal, 0);
  const subtotalBeforeVat = knownSubtotal + profitAmount;

  return {
    tier,
    items,
    materials_subtotal: quotation.total_material_cost,
    service_cost: {
      labor_cost: laborCost,
      rush_job_cost: 0,
      equipment_cost: 0,
      contingency_cost: 0,
      other_cost: Math.max(serviceSubtotal - laborCost, 0),
      subtotal: serviceSubtotal,
    },
    ocm_percentage: 0,
    ocm_amount: 0,
    profit_margin_percentage: knownSubtotal > 0 ? (profitAmount / knownSubtotal) * 100 : 0,
    profit_amount: profitAmount,
    subtotal_before_vat: subtotalBeforeVat,
    vat: {
      rate_percentage: SAVED_QUOTATION_VAT_RATE,
      taxable_base: subtotalBeforeVat,
      amount: vatAmount,
    },
    vat_inclusive: vatAmount > 0,
    grand_total: quotation.grand_total,
    timeline_label: tierLabels.timeline_label,
    warranty_label: tierLabels.warranty_label,
    lifespan_label: tierLabels.lifespan_label,
    material_grade_label: tierLabels.material_grade_label,
  };
}


// For Detailed Project Quotation

export function QuotationDetailView({ quotationId }: { quotationId: string }) {
  const router = useRouter();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [lockedItems, setLockedItems] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceReferenceMessage, setPriceReferenceMessage] = useState<string | null>(null);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [selectedBreakdownVersion, setSelectedBreakdownVersion] = useState<number | null>(null);

  const loadQuotation = useCallback(async () => {
    const response = await fetch(`/api/quotations/${quotationId}`);
    const text = await response.text();
    const data = parseJsonOrNull(text);
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

  function toggleLock(quoteItemId: number) {
    setLockedItems((current) => {
      const next = new Set(current);
      if (next.has(quoteItemId)) next.delete(quoteItemId);
      else next.add(quoteItemId);
      return next;
    });
  }

  async function refreshPriceReference() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setError(null);
    setPriceReferenceMessage(null);
    try {
      const response = await fetch(`/api/quotations/${quotationId}/refresh-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked_item_ids: Array.from(lockedItems), recalculate_totals: true }),
      });
      const text = await response.text();
      const parsed = parseJsonOrNull(text);
      if (!response.ok) throw new Error((parsed as ErrorResponse | null)?.error ?? "Price refresh failed.");
      const result = parsed as RefreshResult | null;
      if (!result) throw new Error("Price refresh failed.");
      await loadQuotation();
      setSelectedBreakdownVersion(null);
      setLockedItems(new Set());

      if (Math.abs(result.total_impact) > 0) {
        setPriceReferenceMessage(`Price reference updated. Total changed by ${peso(Math.abs(result.total_impact))}.`);
      } else {
        setPriceReferenceMessage("Prices are up to date.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Price refresh failed.");
    } finally {
      setIsRefreshing(false);
      setShowRefreshConfirm(false);
    }
  }

  async function refreshPrices() {
    await refreshPriceReference();
  }

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Loading quotation...</div>;
  if (error && !quotation) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!quotation) return null;

  const isPremium = quotation.accepted_tier === "Premium";
  const tier = quotation.accepted_tier ?? "Quotation";
  const breakdownTier = getSavedQuotationTier(quotation.accepted_tier);
  const savedBreakdown = quotation.finalized_breakdown_snapshot;
  const breakdownVersions = quotation.finalized_breakdown_versions ?? (savedBreakdown ? [savedBreakdown] : []);
  const activeSavedBreakdown =
    breakdownVersions.find((version) => version.version_number === selectedBreakdownVersion) ??
    breakdownVersions[0] ??
    savedBreakdown;
  const breakdownResult = activeSavedBreakdown?.result ?? createSavedBreakdownResult(quotation, breakdownTier);
  const displayedBreakdownTier = activeSavedBreakdown?.tier ?? breakdownTier;
  const displayedPricelistBasis = activeSavedBreakdown?.pricelist_basis_at_finalize ?? activeSavedBreakdown?.pricelistBasis ?? SAVED_QUOTATION_PRICELIST_BASIS;
  const latestSavedBreakdown = breakdownVersions[0] ?? savedBreakdown;
  const activeVersionNumber = activeSavedBreakdown?.version_number ?? null;
  const latestVersionNumber = latestSavedBreakdown?.version_number ?? null;
  const activeGrandTotal = activeSavedBreakdown?.result?.grand_total ?? quotation.grand_total;
  const latestGrandTotal = latestSavedBreakdown?.result?.grand_total ?? quotation.grand_total;
  const activePriceReferenceDate = activeSavedBreakdown?.finalized_at ?? quotation.updated_at;
  const versionTotalDifference = Number((latestGrandTotal - activeGrandTotal).toFixed(2));
  const derivedPriceReferenceMessage =
    activeVersionNumber !== null &&
    latestVersionNumber !== null &&
    activeVersionNumber !== latestVersionNumber &&
    Math.abs(versionTotalDifference) > 0
      ? `Price reference is ${versionTotalDifference > 0 ? "cheaper" : "more expensive"}. Total change by ${peso(Math.abs(versionTotalDifference))}.`
      : priceReferenceMessage;
  const tierGradient = isPremium
    ? "project-tier-gradient bg-linear-to-r from-[#0000CD] via-[#4169E1] to-[#0000CD]"
    : "project-tier-gradient bg-linear-to-r from-primary via-orange-400 to-primary";
  const clientName = quotation.client?.client_name ?? "Client not assigned";
  const backHref = quotation.client?.client_id ? `/clients/${quotation.client.client_id}` : "/projects";
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

      <button type="button" onClick={() => router.push(backHref)} className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary" aria-label={quotation.client?.client_id ? "Back to client projects" : "Back to Open Projects"}>
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
              ["Created By", quotation.created_by_user_name || quotation.created_by_user_email || `User #${quotation.user_id}`],
              ["Notes", quotation.client?.notes || "-"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p><p className="mt-0.5 text-sm font-medium text-gray-700">{value}</p></div>
            ))}
          </div>
        </section>

        <section className="flex h-full flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className={`${tierGradient} px-5 py-4 text-white`}>
            <div className="flex items-center justify-between">
              <div><span className="text-[10px] font-semibold uppercase tracking-widest opacity-80">Quote Option</span><h2 className="text-xl font-bold leading-tight">{tier}</h2></div>
              <div className="flex items-center gap-2">
                {isPremium ? <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" /> : <TrendingDown className="h-4 w-4 text-white/80" />}
              </div>
            </div>
            <div className="mt-3 border-t border-white/20 pt-3"><p className="text-[10px] uppercase tracking-widest opacity-70">Total (incl. VAT): {new Date(activePriceReferenceDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}</p><p className="text-2xl font-extrabold">{peso(activeGrandTotal)}</p></div>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: Clock, label: "Timeline", value: breakdownResult.timeline_label || "Not saved" },
                { icon: Shield, label: "Warranty", value: breakdownResult.warranty_label || "Not saved" },
                { icon: Award, label: "Material Grade", value: breakdownResult.material_grade_label || (isPremium ? "Premium" : quotation.accepted_tier === "Practical" ? "Standard" : "Not saved") },
                { icon: Clock, label: "Lifespan", value: breakdownResult.lifespan_label || "Not saved" },
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
                <div className="ml-auto flex items-center gap-2">
                  {breakdownVersions.length > 1 ? (
                    <select
                      value={activeSavedBreakdown?.version_number ?? ""}
                      onChange={(event) => setSelectedBreakdownVersion(Number(event.target.value))}
                      aria-label="Select breakdown version"
                      className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[10px] font-bold text-gray-600 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      {breakdownVersions.map((version) => (
                        <option key={version.version_number ?? 1} value={version.version_number ?? 1}>
                          Version {version.version_number ?? 1}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-600">{breakdownVersions.length || 1} version</span>
                  )}
                  <button
                    type="button"
                    onClick={() => refreshPriceReference()}
                    disabled={isRefreshing}
                    aria-label="Refresh price reference"
                    title="Refresh price reference"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-600">Viewing prices as of <strong>{new Date(activePriceReferenceDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}</strong></p>
              {derivedPriceReferenceMessage && (
                <p className={`text-xs font-semibold ${derivedPriceReferenceMessage.includes("up to date") ? "text-green-700" : "text-primary"}`}>
                  {derivedPriceReferenceMessage}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3.5">
            <button type="button" onClick={() => setShowBreakdown(true)} className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition hover:opacity-90 ${tierGradient}`}>View Breakdown</button>
            {quotation.status === "Draft" && <Button variant="outline" className="mt-2 w-full" onClick={() => setShowRefreshConfirm(true)} disabled={isRefreshing}><RefreshCw className="h-4 w-4" /> Refresh Prices</Button>}
          </div>
        </section>
      </div>

      {showBreakdown && (
        <QuotationBreakdownModal
          tier={displayedBreakdownTier}
          result={breakdownResult}
          pricelistBasis={displayedPricelistBasis}
          onClose={() => setShowBreakdown(false)}
          blueprintFloors={activeSavedBreakdown?.blueprintFloors ?? null}
          segments={activeSavedBreakdown?.segments ?? []}
          versionOptions={breakdownVersions.map((version) => ({
            version_number: version.version_number,
            finalized_at: version.finalized_at,
          }))}
          selectedVersion={activeSavedBreakdown?.version_number ?? null}
          onVersionChange={setSelectedBreakdownVersion}
        />
      )}

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
    </div>
  );
}
