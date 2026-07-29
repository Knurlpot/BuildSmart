"use client";

import { useState } from "react";
import { AlertTriangle, BarChart2, BookOpen, Database, FileText, Layers, ShoppingBag, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { fmtPeso } from "@/lib/dev/provisional/quotationBreakdownFixtures";
import type { ItemCategory, PricelistBasis, ProvisionalItemLine, ProvisionalQuotationTierResult, ProvisionalTier } from "@/lib/dev/provisional/quotationBreakdownTypes";

type TabId = "segments" | "boq" | "cost-summary" | "benchmarking";

interface QuotationBreakdownModalProps {
  tier: ProvisionalTier;
  result: ProvisionalQuotationTierResult;
  pricelistBasis: PricelistBasis;
  onBasisChange: (basis: PricelistBasis) => void;
  onClose: () => void;
}

const TIER_ACCENT: Record<ProvisionalTier, string> = { Practical: "text-primary", Premium: "text-indigo-600" };
const SOURCE_BADGE: Record<string, string> = {
  DPWH: "bg-blue-100 text-blue-700",
  PSA: "bg-purple-100 text-purple-700",
  Supplier: "bg-green-100 text-green-700",
  Internal: "bg-amber-100 text-amber-700",
};

function SourceBadge({ source }: { source: string }) {
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${SOURCE_BADGE[source] ?? "bg-gray-100 text-gray-600"}`}>{source}</span>;
}

// Part B — one small box per item line: real provenance fields (price_source/region/
// quarter+year or recorded_at), and a Confidence row that is LABELED BUT ALWAYS BLANK.
// There is no computed basis for price confidence anywhere yet — this must never show a
// fabricated "High/Medium/Low." It only ever fills in the day a real computation backs it.
function PricingReferenceBox({ line }: { line: ProvisionalItemLine }) {
  const ref = line.pricing_reference;
  const dateLabel = ref.quarter && ref.year ? `${ref.quarter} ${ref.year}` : ref.recorded_at ? new Date(ref.recorded_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-[11px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wide text-gray-400">Pricing Reference</span>
        <SourceBadge source={ref.price_source} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-gray-500">
        <span>Region: {ref.region ?? "—"}</span>
        <span>Recorded: {dateLabel}</span>
        <span className="italic text-gray-400">Confidence: — (not yet computed)</span>
      </div>
    </div>
  );
}

function CategoryChip({ category }: { category: ItemCategory }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${category === "Material" ? "bg-orange-50 text-primary" : "bg-indigo-50 text-indigo-600"}`}>
      {category}
    </span>
  );
}

// Part A — READ-ONLY. Every value below is plain text; there is no input, button-to-edit,
// or click-to-change affordance anywhere in this component. Editing lives ONLY in Minor
// Revision (MinorRevisionPanel.tsx) — a VIEW that silently let you change numbers would be
// actively dangerous, not just a UX nitpick.
function SegmentBreakdownTab({ items }: { items: ProvisionalItemLine[] }) {
  const segmentIds = Array.from(new Set(items.map((l) => l.segment_draft_id)));
  return (
    <div className="flex flex-col gap-4">
      {segmentIds.map((segId) => {
        const segLines = items.filter((l) => l.segment_draft_id === segId);
        const first = segLines[0];
        return (
          <div key={segId} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">{first.segment_name}</p>
                <p className="text-xs text-gray-400">
                  {first.floor_level || "—"} · {first.derived_area_sqm?.toFixed(1) ?? "—"} sqm · {first.treatment_type ?? "Treatment not specified"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {segLines.map((line) => (
                <div key={line.line_id} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center gap-2">
                    <CategoryChip category={line.category} />
                    <p className="truncate text-xs font-semibold text-gray-800">{line.item_name}</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {line.unit_price === null ? (
                      <span className="font-semibold text-amber-600">No rate on file — resolve in Minor Revision</span>
                    ) : line.category === "Material" ? (
                      <>
                        {line.derived_area_sqm?.toFixed(1)} sqm × {line.derived_coverage_per_sqm?.toFixed(2)} coverage ×{" "}
                        {(1 + (line.derived_wastage_percentage ?? 0) / 100).toFixed(2)} wastage = <span className="font-semibold text-gray-800">{line.quantity.toFixed(1)} {line.unit}</span>
                      </>
                    ) : (
                      <>
                        {line.derived_area_sqm?.toFixed(1)} sqm × {line.derived_coverage_per_sqm?.toFixed(2)} hrs/sqm ={" "}
                        <span className="font-semibold text-gray-800">{line.quantity.toFixed(1)} {line.unit}</span>
                      </>
                    )}
                  </p>
                  <PricingReferenceBox line={line} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoqTab({ items }: { items: ProvisionalItemLine[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        Item-level Bill of Quantities — read-only. Every line is derived from a segment&apos;s treatment (Part C: this
        shows specific materials, not just service types, once <code className="rounded bg-gray-100 px-1">treatment_type</code> and
        material rules exist on the backend). To edit a quantity, price, or supplier, use Validate &amp; Edit →
        Minor Revision.
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Item</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Segment</th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-500">Qty</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Unit</th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-500">Unit Price</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Source</th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-500">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((line) => (
              <tr key={line.line_id} className={`border-b border-gray-100 ${line.unit_price === null ? "bg-amber-50/40" : line.is_overridden ? "bg-blue-50/30" : ""}`}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <CategoryChip category={line.category} />
                    <span className="font-medium text-gray-800">{line.item_name}</span>
                    {line.is_overridden && <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-600">Overridden</span>}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-gray-500">{line.segment_name}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{line.quantity.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-gray-500">{line.unit}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{line.unit_price !== null ? fmtPeso(line.unit_price) : <span className="font-semibold text-amber-600">Missing rule</span>}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <SourceBadge source={line.pricing_reference.price_source} />
                    <span className="text-gray-400">{line.pricing_reference.region ?? (line.pricing_reference.recorded_at ? new Date(line.pricing_reference.recorded_at).toLocaleDateString("en-PH", { year: "numeric", month: "short" }) : "—")}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-gray-900">{line.total_cost !== null ? fmtPeso(line.total_cost) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CostSummaryTab({ result }: { result: ProvisionalQuotationTierResult }) {
  const unresolvedCount = result.items.filter((l) => l.unit_price === null).length;
  const rows: { label: string; value: number; bold?: boolean }[] = [
    { label: "Materials Subtotal", value: result.materials_subtotal },
    { label: "Labor", value: result.service_cost.labor_cost },
    { label: "Equipment", value: result.service_cost.equipment_cost },
    { label: "Contingency / Other (PPE, mobilization)", value: result.service_cost.contingency_cost + result.service_cost.other_cost },
    { label: `Overhead (OCM, ${result.ocm_percentage}%)`, value: result.ocm_amount },
    { label: `Profit / Markup (${result.profit_margin_percentage}%)`, value: result.profit_amount },
  ];

  return (
    <div className="flex flex-col gap-4">
      {unresolvedCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {unresolvedCount} line{unresolvedCount === 1 ? "" : "s"} still missing a rate — excluded from every total below
          until resolved in Minor Revision.
        </div>
      )}
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between border-b border-gray-100 py-2.5 last:border-0">
            <span className="text-sm text-gray-500">{row.label}</span>
            <span className="text-sm font-semibold text-gray-800">{fmtPeso(row.value)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t-2 border-gray-200 py-2.5">
          <span className="text-sm font-bold text-gray-900">Subtotal (before VAT)</span>
          <span className="text-sm font-bold text-gray-900">{fmtPeso(result.subtotal_before_vat)}</span>
        </div>
        <div className="flex items-center justify-between border-b border-gray-100 py-2.5">
          <span className="text-sm text-gray-500">
            VAT ({result.vat.rate_percentage}%) — {result.vat_inclusive ? "applied" : "waived for this client"}
          </span>
          <span className="text-sm font-semibold text-gray-800">{fmtPeso(result.vat.amount)}</span>
        </div>
        <div className="flex items-center justify-between py-3">
          <span className="text-base font-bold text-gray-900">Grand Total</span>
          <span className={`text-2xl font-extrabold ${TIER_ACCENT[result.tier]}`}>{fmtPeso(result.grand_total)}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
          <span className="text-xs font-semibold text-gray-500">Downpayment ({result.downpayment_percentage}%)</span>
          <span className="text-sm font-bold text-gray-700">{fmtPeso(result.downpayment_amount)}</span>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">
        VAT and Downpayment are shown as separate bottom-line figures, never folded into a line item. Every figure
        above is a mock fixture value; no real pricelist/supplier/rule lookup produced it.
      </p>
    </div>
  );
}

function BenchmarkingTab({ items }: { items: ProvisionalItemLine[] }) {
  const withSuppliers = items.filter((l) => l.supplier_options.length > 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
        <ShoppingBag className="h-4 w-4 shrink-0" />
        Comparing suppliers by price AND stock availability against what this quote actually needs. Stock figures
        are provisional (no <code className="rounded bg-white px-1">supplier_item_stock</code> table exists yet) —
        never treat them as live inventory.
      </div>
      {withSuppliers.map((line) => (
        <div key={line.line_id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-900">{line.item_name}</p>
              <p className="text-xs text-gray-400">
                {line.segment_name} · needs {line.quantity.toFixed(1)} {line.unit}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Supplier</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Unit Price</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Available</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-500">Can Fulfil?</th>
                </tr>
              </thead>
              <tbody>
                {line.supplier_options.map((sup) => {
                  const canFulfil = sup.quantity_available === null || sup.quantity_available >= line.quantity;
                  const isSelected = sup.supplier_id === line.selected_supplier_id;
                  return (
                    <tr key={sup.supplier_id} className={`border-b border-gray-100 last:border-0 ${isSelected ? "bg-orange-50/40" : ""} ${!canFulfil ? "bg-red-50/40" : ""}`}>
                      <td className="px-3 py-2 font-medium text-gray-800">
                        {sup.supplier_name} {isSelected && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">Selected</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{fmtPeso(sup.unit_price)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{sup.quantity_available === null ? "Unlimited" : `${sup.quantity_available.toFixed(0)} ${line.unit}`}</td>
                      <td className="px-3 py-2 text-center">
                        {canFulfil ? (
                          <span className="font-semibold text-green-600">Yes</span>
                        ) : (
                          <span className="flex items-center justify-center gap-1 font-semibold text-red-600">
                            <AlertTriangle className="h-3 w-3" /> Only {sup.quantity_available?.toFixed(0)} of {line.quantity.toFixed(0)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {withSuppliers.length === 0 && <p className="text-sm text-gray-400">No priced items with supplier options to compare yet.</p>}
    </div>
  );
}

export function QuotationBreakdownModal({ tier, result, pricelistBasis, onBasisChange, onClose }: QuotationBreakdownModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("segments");
  const TABS: { id: TabId; label: string; icon: typeof BookOpen }[] = [
    { id: "segments", label: "Segment Breakdown", icon: Layers },
    { id: "boq", label: "Bill of Quantities", icon: BookOpen },
    { id: "cost-summary", label: "Cost Summary", icon: BarChart2 },
    { id: "benchmarking", label: "Supplier Benchmarking", icon: ShoppingBag },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Part F — near-full-screen with only a thin margin (h-[95vh] w-[96vw]), rather than
          a fixed max-width card, so a data-heavy quote (many segments/items) has real room
          instead of forcing scroll-within-scroll; a small quote just leaves more of its own
          whitespace inside the same frame. */}
      {/* sm:max-w-[1600px] (not just max-w-[1600px]) is required — DialogContent's own
          default is `sm:max-w-sm`, and twMerge only dedupes conflicting utilities within the
          SAME variant. An unprefixed max-w-* here would lose to that sm: variant at any real
          viewport width, silently capping this at 384px instead of near-full-screen. */}
      <DialogContent className="flex h-[95vh] w-[96vw] max-w-400 sm:max-w-400 flex-col p-0" showCloseButton={false}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Detailed Breakdown — <span className={TIER_ACCENT[tier]}>{tier}</span>
              <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">View only</span>
            </h2>
            <p className="text-xs text-gray-500">Full cost transparency · all prices in Philippine Pesos (₱) · mock fixture values</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Pricelist Basis:</span>
              <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs">
                <button
                  type="button"
                  onClick={() => onBasisChange("Uploaded")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-colors ${pricelistBasis === "Uploaded" ? "bg-primary text-primary-foreground" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  <FileText className="h-3 w-3" /> Uploaded Pricelist
                </button>
                <button
                  type="button"
                  onClick={() => onBasisChange("DPWH")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-colors ${pricelistBasis === "DPWH" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  <Database className="h-3 w-3" /> DPWH CMPD
                </button>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-200">
              <X className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 border-b border-gray-200 bg-white px-6">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-4 py-3 text-xs font-semibold transition-colors ${active ? "text-primary" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "segments" && <SegmentBreakdownTab items={result.items} />}
          {activeTab === "boq" && <BoqTab items={result.items} />}
          {activeTab === "cost-summary" && <CostSummaryTab result={result} />}
          {activeTab === "benchmarking" && <BenchmarkingTab items={result.items} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
