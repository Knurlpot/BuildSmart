"use client";

import { useState } from "react";
import { AlertTriangle, BarChart2, BookOpen, Check, ChevronDown, ChevronUp, Layers, Pencil, ShoppingBag, TrendingDown, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { fmtPeso } from "@/lib/dev/provisional/quotationBreakdownFixtures";
import type { ItemCategory, PricelistBasis, ProvisionalItemLine, ProvisionalQuotationTierResult, ProvisionalTier } from "@/lib/dev/provisional/quotationBreakdownTypes";
import type { BlueprintFloor } from "@/lib/dev/provisional/quotationGenerationTypes";
import type { DraftSegment } from "../lib/draftSegment";
import { SegmentBlueprintPreview } from "./SegmentBlueprintPreview";

type TabId = "segments" | "boq" | "cost-summary" | "benchmarking";

interface QuotationBreakdownModalProps {
  tier: ProvisionalTier;
  result: ProvisionalQuotationTierResult;
  pricelistBasis: PricelistBasis;
  onClose: () => void;
  // Task 7, Part B — Segment Breakdown's split-view blueprint preview (left half). null/
  // undefined = this quote wasn't blueprint-sourced (Quick Measurement/Manual), OR (some
  // saved projects) no blueprint snapshot was captured — either way the tab degrades to a
  // segment list instead. `segments` carries the full DraftSegment[] (polygon_coords,
  // confidence_score, etc.) BlueprintOverlay needs; `result.items` alone isn't enough.
  blueprintFloors?: BlueprintFloor[] | null;
  segments?: DraftSegment[];
}

const TIER_ACCENT: Record<ProvisionalTier, string> = {
  Practical: "text-primary",
  Premium: "text-indigo-600",
};
const SOURCE_BADGE: Record<string, string> = {
  DPWH: "bg-blue-100 text-blue-700",
  PSA: "bg-purple-100 text-purple-700",
  Supplier: "bg-green-100 text-green-700",
  Internal: "bg-amber-100 text-amber-700",
};

function SourceBadge({ source }: { source: string }) {
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${SOURCE_BADGE[source] ?? "bg-gray-100 text-gray-600"}`}>{source}</span>;
}

function selectedSupplierForLine(line: ProvisionalItemLine) {
  const selectedId = line.selected_supplier_id;
  const selectedById = selectedId === null
    ? undefined
    : line.supplier_options.find((supplier) => String(supplier.supplier_id) === String(selectedId));
  if (selectedById) return selectedById;

  const selectedByPrice = line.unit_price === null
    ? undefined
    : line.supplier_options.find((supplier) => Math.abs(supplier.unit_price - line.unit_price!) < 0.005);
  return selectedByPrice ?? (line.supplier_options.length === 1 ? line.supplier_options[0] : undefined);
}

function sourceDisplayForLine(line: ProvisionalItemLine) {
  return selectedSupplierForLine(line)?.supplier_name ?? line.pricing_reference.price_source;
}

function pricelistBasisLabel(basis: PricelistBasis) {
  return basis === "Uploaded" ? "Supplier" : "DPWH CMPD";
}

function sourceLabelForLine(line: ProvisionalItemLine) {
  return selectedSupplierForLine(line)?.supplier_name ?? line.pricing_reference.price_source;
}

function fmtPercentRaw(value: number): string {
  return `${value}%`;
}

// Part B — one small box per item line: real provenance fields (price_source/region/
// quarter+year or recorded_at).
function PricingReferenceBox({ line }: { line: ProvisionalItemLine }) {
  const ref = line.pricing_reference;
  const dateLabel = ref.quarter && ref.year ? `${ref.quarter} ${ref.year}` : ref.recorded_at ? new Date(ref.recorded_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-[11px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wide text-gray-400">Pricing Reference</span>
        <SourceBadge source={sourceDisplayForLine(line)} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-gray-500">
        <span>Recorded: {dateLabel}</span>
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

// Task 7, Part B — one COLLAPSIBLE deck per segment: the header (name, location, subtotal)
// is always visible; expanding it reveals the same item-level breakdown + Pricing Reference
// this tab always showed. Collapsed by default (`defaultOpen`) so a quote with many
// segments doesn't dump every line at once — the right half of the split view.
function SegmentCostDeck({ segLines, defaultOpen, hovered, onHoverChange }: { segLines: ProvisionalItemLine[]; defaultOpen: boolean; hovered: boolean; onHoverChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const first = segLines[0];
  const subtotal = segLines.reduce((sum, l) => sum + (l.total_cost ?? 0), 0);

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm transition-colors ${hovered ? "border-primary" : "border-gray-100"}`}
      onMouseEnter={() => onHoverChange(first.segment_draft_id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gray-900">{first.segment_name}</p>
          <p className="truncate text-xs text-gray-400">
            {first.floor_level || "—"} · {first.derived_area_sqm?.toFixed(1) ?? "—"} sqm · {first.treatment_type ?? "Treatment not specified"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-bold text-gray-800">{fmtPeso(subtotal)}</span>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 border-t border-gray-100 p-4 lg:grid-cols-2">
          {segLines.map((line) => (
            <div key={line.line_id} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3">
              <div className="flex items-center gap-2">
                <CategoryChip category={line.category} />
                <p className="truncate text-xs font-semibold text-gray-800">{line.item_name}</p>
              </div>
              <p className="text-xs text-gray-500">
                {line.unit_price === null ? (
                  <span className="font-semibold text-amber-600">No rate on file.</span>
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
      )}
    </div>
  );
}

/** Left-half fallback when there's no blueprint for this quote (Quick Measurement/Manual,
 * or a saved project with no captured blueprint snapshot) — degrades to a plain segment
 * list instead of leaving the split view's left half empty. Same segment grouping as the
 * cost decks on the right, just area/floor/treatment instead of a polygon. */
function SegmentListFallback({ items, hoveredId, onHoverChange }: { items: ProvisionalItemLine[]; hoveredId: string | null; onHoverChange: (id: string | null) => void }) {
  const segmentIds = Array.from(new Set(items.map((l) => l.segment_draft_id)));
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Segments · no blueprint for this quote</p>
      <div className="flex flex-col divide-y divide-gray-100">
        {segmentIds.map((segId) => {
          const first = items.find((l) => l.segment_draft_id === segId)!;
          return (
            <div
              key={segId}
              onMouseEnter={() => onHoverChange(segId)}
              onMouseLeave={() => onHoverChange(null)}
              className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors ${hoveredId === segId ? "bg-orange-50/60" : ""}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800">{first.segment_name}</p>
                <p className="truncate text-xs text-gray-400">{first.floor_level || "—"} · {first.treatment_type ?? "Treatment not specified"}</p>
              </div>
              <span className="shrink-0 text-sm font-bold text-gray-700">{first.derived_area_sqm?.toFixed(1) ?? "—"} sqm</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Part A — READ-ONLY. Every value below is plain text; there is no input, button-to-edit,
// or click-to-change affordance anywhere in this component. Editing lives ONLY in Minor
// Revision (MinorRevisionPanel.tsx) — a VIEW that silently let you change numbers would be
// actively dangerous, not just a UX nitpick.
//
// Task 7, Part B — split view: left half previews the blueprint (reusing BlueprintOverlay
// exactly, via SegmentBlueprintPreview) when one exists for this quote, otherwise degrades
// to SegmentListFallback; right half is one collapsible cost deck per segment.
function SegmentBreakdownTab({ items, segments, blueprintFloors }: { items: ProvisionalItemLine[]; segments?: DraftSegment[]; blueprintFloors?: BlueprintFloor[] | null }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const materialItems = items.filter((line) => line.category === "Material");
  const segmentIds = Array.from(new Set(materialItems.map((l) => l.segment_draft_id)));
  const hasBlueprint = !!blueprintFloors && blueprintFloors.length > 0 && !!segments && segments.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
      <div className="lg:sticky lg:top-0">
        {hasBlueprint ? (
          <SegmentBlueprintPreview floors={blueprintFloors!} segments={segments!} hoveredId={hoveredId} onHoverChange={setHoveredId} />
        ) : (
          <SegmentListFallback items={materialItems} hoveredId={hoveredId} onHoverChange={setHoveredId} />
        )}
      </div>
      <div className={`flex flex-col gap-2 ${segmentIds.length >= 4 ? "max-h-[34rem] overflow-y-auto pr-1" : ""}`}>
        {segmentIds.map((segId) => (
          <SegmentCostDeck
            key={segId}
            segLines={materialItems.filter((l) => l.segment_draft_id === segId)}
            defaultOpen={false}
            hovered={hoveredId === segId}
            onHoverChange={setHoveredId}
          />
        ))}
      </div>
    </div>
  );
}

function BoqTab({ items }: { items: ProvisionalItemLine[] }) {
  const materialItems = items.filter((line) => line.category === "Material");
  const segmentGroups = Array.from(
    materialItems.reduce((groups, line) => {
      const key = line.segment_draft_id || line.segment_name;
      groups.set(key, [...(groups.get(key) ?? []), line]);
      return groups;
    }, new Map<string, ProvisionalItemLine[]>())
  );
  const hasMultipleSegments = segmentGroups.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        Materials needed:
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
            {segmentGroups.flatMap(([segmentId, lines]) => [
              ...(hasMultipleSegments
                ? [
                    <tr key={`${segmentId}-header`} className="border-y border-gray-200 bg-gray-100/80">
                      <td colSpan={7} className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-600">
                        {lines[0]?.segment_name ?? "Segment"} Materials
                      </td>
                    </tr>,
                  ]
                : []),
              ...lines.map((line) => (
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
                  <td className="px-3 py-2.5 text-right text-gray-700">{line.unit_price !== null ? fmtPeso(line.unit_price) : <span className="font-semibold text-amber-600">Missing price</span>}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-gray-700">{sourceLabelForLine(line)}</span>
                      <span className="text-gray-400">
                        {line.pricing_reference.recorded_at
                          ? new Date(line.pricing_reference.recorded_at).toLocaleDateString("en-PH", { year: "numeric", month: "short" })
                          : "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-900">{line.total_cost !== null ? fmtPeso(line.total_cost) : "—"}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CostSummaryTab({ result }: { result: ProvisionalQuotationTierResult }) {
  const unresolvedCount = result.items.filter((l) => l.unit_price === null).length;
  const rushJobCost = result.service_cost.rush_job_cost ?? 0;
  const rushPercentage = result.service_cost.labor_cost > 0 ? (rushJobCost / result.service_cost.labor_cost) * 100 : 0;
  const rows: { label: string; value: number; bold?: boolean }[] = [
    { label: "Materials Subtotal", value: result.materials_subtotal },
    {
      label: rushJobCost > 0 ? `Labor (${fmtPercentRaw(rushPercentage)} Rush Job)` : "Labor",
      value: result.service_cost.labor_cost + rushJobCost,
    },
    { label: "Equipment", value: result.service_cost.equipment_cost },
    { label: "Contingency / Other (PPE, mobilization)", value: result.service_cost.contingency_cost + result.service_cost.other_cost },
    { label: `Overhead (OCM, ${fmtPercentRaw(result.ocm_percentage)})`, value: result.ocm_amount },
    { label: `Profit / Markup (${fmtPercentRaw(result.profit_margin_percentage)})`, value: result.profit_amount },
  ];

  return (
    <div className="flex flex-col gap-4">
      {unresolvedCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Missing {unresolvedCount} Rate{unresolvedCount === 1 ? "" : "s"}. Excluded from the Total below.
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
            VAT ({fmtPercentRaw(result.vat.rate_percentage)}): {result.vat_inclusive ? "applied" : "waived for this client"}
          </span>
          <span className="text-sm font-semibold text-gray-800">{fmtPeso(result.vat.amount)}</span>
        </div>
        <div className="flex items-center justify-between py-3">
          <span className="text-base font-bold text-gray-900">Grand Total</span>
          <span className={`text-2xl font-extrabold ${TIER_ACCENT[result.tier]}`}>{fmtPeso(result.grand_total)}</span>
        </div>
      </div>
    </div>
  );
}

// Part C (Task 7) — PRICE-ONLY. Backend decision: the system does not track supplier
// stock/availability at all (out of scope — a quoting tool, not inventory), so there is no
// "Available"/"Can Fulfil?" column here anymore. Comparing suppliers by price, plus the
// Uploaded-Pricelist-vs-DPWH toggle in the header above, is the whole of this tab.
function BenchmarkingTab({ items }: { items: ProvisionalItemLine[] }) {
  const withSuppliers = items.filter((line) => line.category === "Material" && line.supplier_options.length > 0);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Record<string, string | number | null>>({});
  const offerCount = withSuppliers.reduce((total, line) => total + line.supplier_options.length, 0);
  const selectedTotal = withSuppliers.reduce((total, line) => {
    const selectedId = selectedSuppliers[line.line_id] ?? line.selected_supplier_id;
    const selected = line.supplier_options.find((supplier) => supplier.supplier_id === selectedId);
    return total + (selected?.unit_price ?? line.unit_price ?? 0) * line.quantity;
  }, 0);
  const lowestTotal = withSuppliers.reduce((total, line) => {
    const lowest = Math.min(...line.supplier_options.map((supplier) => supplier.unit_price));
    return total + lowest * line.quantity;
  }, 0);
  const potentialSavings = Math.max(0, selectedTotal - lowestTotal);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Materials compared</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{withSuppliers.length}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Supplier prices</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{offerCount}</p>
        </div>
        <div className="rounded-xl border border-green-100 bg-green-50/60 p-4 shadow-sm">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-700">
            <TrendingDown className="h-3.5 w-3.5" /> Potential savings
          </p>
          <p className="mt-1 text-xl font-bold text-green-700">{fmtPeso(potentialSavings)}</p>
        </div>
      </div>
      {withSuppliers.map((line) => (
        <div key={line.line_id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-900">{line.item_name}</p>
              <p className="text-xs text-gray-400">
                {line.segment_name} · {line.quantity.toFixed(1)} {line.unit}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingLineId((current) => (current === line.line_id ? null : line.line_id))}
              title={editingLineId === line.line_id ? "Done selecting supplier" : "Edit selected supplier"}
              aria-label={editingLineId === line.line_id ? "Done selecting supplier" : "Edit selected supplier"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary/40 hover:text-primary"
            >
              {editingLineId === line.line_id ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Supplier</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Brand</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Location</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Unit Price</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Line Total</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Difference</th>
                </tr>
              </thead>
              <tbody>
                {[...line.supplier_options]
                  .sort((a, b) => a.unit_price - b.unit_price)
                  .map((sup, index, sorted) => {
                    const selectedSupplier = selectedSuppliers[line.line_id] ?? line.selected_supplier_id;
                    const isSelected = sup.supplier_id === selectedSupplier;
                    const difference = sup.unit_price - (sorted[0]?.unit_price ?? sup.unit_price);
                    return (
                      <tr
                        key={`${sup.supplier_id}-${index}`}
                        className={`border-b border-gray-100 last:border-0 ${isSelected ? "bg-orange-50/40" : ""} ${editingLineId === line.line_id ? "cursor-pointer hover:bg-gray-50" : ""}`}
                        onClick={() => {
                          if (editingLineId !== line.line_id) return;
                          setSelectedSuppliers((prev) => ({ ...prev, [line.line_id]: sup.supplier_id }));
                        }}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 font-medium text-gray-800">
                            <span>{sup.supplier_name}</span>
                            {index === 0 && <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700">Lowest</span>}
                            {isSelected && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">Selected</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{sup.brand || "Not specified"}</td>
                        <td className="px-3 py-2 text-gray-500">{sup.location || "Not specified"}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-700">{fmtPeso(sup.unit_price)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmtPeso(sup.unit_price * line.quantity)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${difference === 0 ? "text-green-700" : "text-gray-500"}`}>
                          {difference === 0 ? "Best price" : `+${fmtPeso(difference * line.quantity)}`}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {withSuppliers.length === 0 && (
        <div className="flex flex-col items-center rounded-xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <ShoppingBag className="h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm font-semibold text-gray-700">No supplier prices to compare</p>
          <p className="mt-1 text-xs text-gray-400">Upload supplier pricelists for the materials in this quotation.</p>
        </div>
      )}
    </div>
  );
}

export function QuotationBreakdownModal({ tier, result, pricelistBasis, onClose, blueprintFloors, segments }: QuotationBreakdownModalProps) {
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
      <DialogContent className="flex h-[92vh] w-[94vw] max-w-400 sm:max-w-400 flex-col p-0" showCloseButton={false}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Detailed Breakdown: <span className={TIER_ACCENT[tier]}>{tier}</span>
            </h2>
            <p className="text-xs text-gray-500">Full cost transparency · all prices in Philippine Pesos (₱)</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Pricelist Basis:</span>
              <span className="rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                {pricelistBasisLabel(pricelistBasis)}
              </span>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-200">
              <X className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 border-b border-gray-200 bg-white px-5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${active ? "text-primary" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-0">
          {activeTab === "segments" && <SegmentBreakdownTab items={result.items} segments={segments} blueprintFloors={blueprintFloors} />}
          {activeTab === "boq" && <BoqTab items={result.items} />}
          {activeTab === "cost-summary" && <CostSummaryTab result={result} />}
          {activeTab === "benchmarking" && <BenchmarkingTab items={result.items} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
