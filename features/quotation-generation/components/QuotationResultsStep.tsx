"use client";

import { useState } from "react";
import { Award, CheckCircle2, Clock, PenLine, Shield, Star, TrendingDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuotationBreakdownModal } from "./QuotationBreakdownModal";
import { RevisionTypeModal } from "./RevisionTypeModal";
import { MinorRevisionPanel } from "./MinorRevisionPanel";
import { computeTierResult, deriveMockItemLines, fmtPeso, retargetItemLinesBasis } from "@/lib/dev/provisional/quotationBreakdownFixtures";
import { PROVISIONAL_TIERS, type PricelistBasis, type ProvisionalItemLine, type ProvisionalQuotationTierResult, type ProvisionalTier } from "@/lib/dev/provisional/quotationBreakdownTypes";
import { saveFinalizedQuotation } from "@/lib/dev/provisional/savedProjectsStore";
import { isSegmentIncluded, type DraftSegment } from "../lib/draftSegment";
import type { Client, Quotation } from "@/types/entities";
import type { BlueprintFloor } from "@/lib/dev/provisional/quotationGenerationTypes";

interface QuotationResultsStepProps {
  client: Client;
  quotation: Quotation;
  segments: DraftSegment[];
  /** Task 7, Part B — threaded through to QuotationBreakdownModal's Segment Breakdown tab
   * (split view's blueprint preview) and persisted at Finalize so Open Projects' saved view
   * can show the same preview. null = this quote wasn't blueprint-sourced. */
  blueprintFloors: BlueprintFloor[] | null;
  /** Activity diagram's "Structural revision -> Return to segmentation." */
  onStructuralRevision: () => void;
  /** Fires once the finalized project has actually been saved (P2-B) — caller only needs
   * to move the wizard on; the save itself already happened here. */
  onFinalize: () => void;
}

const TIER_META: Record<ProvisionalTier, { tagline: string; badge: string; accent: string; headerBg: string; accentBg: string }> = {
  Economic: {
    tagline: "Cost-effective solution with quality materials",
    badge: "Recommended",
    accent: "text-primary",
    headerBg: "bg-primary",
    accentBg: "bg-orange-50",
  },
  Premium: {
    tagline: "High-spec materials with expedited delivery",
    badge: "Best Quality",
    accent: "text-indigo-600",
    headerBg: "bg-indigo-600",
    accentBg: "bg-indigo-50",
  },
};

const DEFAULT_BASIS: PricelistBasis = "Uploaded";

function initTierItems(segments: DraftSegment[], basis: PricelistBasis): Record<ProvisionalTier, ProvisionalItemLine[]> {
  return {
    Economic: deriveMockItemLines(segments, "Economic", basis),
    Premium: deriveMockItemLines(segments, "Premium", basis),
  };
}

function QuoteCard({ tier, result, onViewBreakdown }: { tier: ProvisionalTier; result: ProvisionalQuotationTierResult; onViewBreakdown: () => void }) {
  const meta = TIER_META[tier];
  const unresolvedCount = result.items.filter((l) => l.unit_price === null).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border-2 border-gray-100 bg-white shadow-sm">
      <div className={`${meta.headerBg} px-5 py-4 text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
              {tier === "Economic" ? "Option A" : "Option B"}
            </span>
            <h2 className="text-xl font-bold leading-tight">{tier}</h2>
            <p className="mt-0.5 text-xs opacity-80">{meta.tagline}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold backdrop-blur">{meta.badge}</span>
            {tier === "Premium" ? <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" /> : <TrendingDown className="h-4 w-4 text-white/80" />}
          </div>
        </div>
        <div className="mt-3 border-t border-white/20 pt-3">
          <p className="text-[10px] uppercase tracking-widest opacity-70">Total Estimate (incl. VAT)</p>
          <p className="text-2xl font-extrabold">{fmtPeso(result.grand_total)}</p>
          {unresolvedCount > 0 && (
            <p className="mt-1 text-[10px] font-semibold text-amber-200">
              {unresolvedCount} line{unresolvedCount === 1 ? "" : "s"} missing a rate — resolve in Minor Revision
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { icon: Clock, label: "Timeline", val: result.timeline_label },
            { icon: Shield, label: "Warranty", val: result.warranty_label },
            { icon: Award, label: "Material Grade", val: result.material_grade_label },
          ].map(({ icon: Icon, label, val }) => (
            <div key={label} className={`rounded-xl ${meta.accentBg} p-2.5`}>
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${meta.accent}`} />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
              </div>
              <p className="mt-0.5 text-xs font-semibold text-gray-800">{val}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Cost Summary</p>
          <div className="flex flex-col gap-1 text-xs">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal (before VAT)</span>
              <span className="font-semibold text-gray-700">{fmtPeso(result.subtotal_before_vat)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>VAT ({result.vat.rate_percentage}%)</span>
              <span className="font-semibold text-gray-700">{fmtPeso(result.vat.amount)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Downpayment ({result.downpayment_percentage}%)</span>
              <span className="font-semibold text-gray-700">{fmtPeso(result.downpayment_amount)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 bg-gray-50 px-5 py-3.5">
        <button
          type="button"
          onClick={onViewBreakdown}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition hover:opacity-90 ${meta.headerBg}`}
        >
          View Detailed Breakdown
        </button>
      </div>
    </div>
  );
}

// P2-A/B/C/D — Generate's results screen: two tier cards (siblings of one
// ProvisionalQuoteGroup — see quotationBreakdownTypes.ts for the tier-linkage fields this
// depends on that don't exist in the schema yet), the READ-ONLY detailed breakdown (Part A),
// and the revision flow (editing lives only in Minor Revision, Part D). Everything
// downstream of `segments` is mock-derived — see quotationBreakdownFixtures.ts.
export function QuotationResultsStep({ client, quotation, segments, blueprintFloors, onStructuralRevision, onFinalize }: QuotationResultsStepProps) {
  const [pricelistBasis, setPricelistBasis] = useState<PricelistBasis>(DEFAULT_BASIS);
  const [originalTierItems] = useState(() => initTierItems(segments, DEFAULT_BASIS));
  const [tierItems, setTierItems] = useState(() => initTierItems(segments, DEFAULT_BASIS));
  const [breakdownTier, setBreakdownTier] = useState<ProvisionalTier | null>(null);
  const [revisionTypeOpen, setRevisionTypeOpen] = useState(false);
  const [minorRevisionTier, setMinorRevisionTier] = useState<ProvisionalTier | null>(null);
  const [structuralConfirmOpen, setStructuralConfirmOpen] = useState(false);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);

  const includedSegments = segments.filter(isSegmentIncluded);
  const totalArea = includedSegments.reduce((sum, s) => sum + s.area_sqm, 0);
  const floors = new Set(includedSegments.map((s) => s.floor_level || "—")).size;

  // Part B/D — the Uploaded/DPWH toggle is shared by the read-only Breakdown view AND
  // Minor Revision; switching it re-prices every NON-overridden line to the new basis for
  // BOTH tiers at once (see retargetItemLinesBasis's doc — a manual override always wins).
  const handleBasisChange = (basis: PricelistBasis) => {
    setPricelistBasis(basis);
    setTierItems((prev) => ({
      Economic: retargetItemLinesBasis(segments, prev.Economic, "Economic", basis),
      Premium: retargetItemLinesBasis(segments, prev.Premium, "Premium", basis),
    }));
  };

  const tierResults: Record<ProvisionalTier, ProvisionalQuotationTierResult> = {
    Economic: computeTierResult("Economic", tierItems.Economic),
    Premium: computeTierResult("Premium", tierItems.Premium),
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Generated Quotations</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Based on <span className="font-semibold text-gray-700">{includedSegments.length} segments · {totalArea.toFixed(1)} sqm · {floors} floor{floors === 1 ? "" : "s"}</span> —
            choose the plan that fits your budget.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRevisionTypeOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-orange-50/60 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-orange-50"
        >
          <PenLine className="h-4 w-4" /> Validate &amp; Edit
        </button>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        {PROVISIONAL_TIERS.map((tier) => (
          <QuoteCard key={tier} tier={tier} result={tierResults[tier]} onViewBreakdown={() => setBreakdownTier(tier)} />
        ))}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setFinalizeConfirmOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
        >
          <CheckCircle2 className="h-4 w-4" /> Finalize Quotation
        </button>
      </div>

      {breakdownTier && (
        // Part A — strictly read-only: no onItemsChange/onLinesChange prop exists on this
        // component at all anymore. See QuotationBreakdownModal.tsx.
        <QuotationBreakdownModal
          tier={breakdownTier}
          result={tierResults[breakdownTier]}
          pricelistBasis={pricelistBasis}
          onBasisChange={handleBasisChange}
          onClose={() => setBreakdownTier(null)}
          segments={segments}
          blueprintFloors={blueprintFloors}
        />
      )}

      {revisionTypeOpen && (
        <RevisionTypeModal
          onClose={() => setRevisionTypeOpen(false)}
          onStructural={() => {
            setRevisionTypeOpen(false);
            setStructuralConfirmOpen(true);
          }}
          onMinor={() => {
            setRevisionTypeOpen(false);
            setMinorRevisionTier("Economic");
          }}
        />
      )}

      {minorRevisionTier && (
        <MinorRevisionPanel
          tier={minorRevisionTier}
          originalItems={originalTierItems[minorRevisionTier]}
          items={tierItems[minorRevisionTier]}
          onItemsChange={(next) => setTierItems((prev) => ({ ...prev, [minorRevisionTier]: next }))}
          pricelistBasis={pricelistBasis}
          onBasisChange={handleBasisChange}
          onClose={() => setMinorRevisionTier(null)}
          onApply={() => setMinorRevisionTier(null)}
        />
      )}

      <Dialog open={structuralConfirmOpen} onOpenChange={setStructuralConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to segmentation?</DialogTitle>
            <DialogDescription>
              This returns you to reviewing/confirming segments — for a blueprint quote, the SAME already-scanned
              areas (no re-upload), for Quick Measurement your existing entries. Both quotation options generated
              here are discarded and regenerated once you continue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setStructuralConfirmOpen(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setStructuralConfirmOpen(false);
                onStructuralRevision();
              }}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
            >
              Return to Segmentation
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={finalizeConfirmOpen} onOpenChange={setFinalizeConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize this quotation?</DialogTitle>
            <DialogDescription>
              Both Economic and Premium are saved as a linked pair for this project — neither is marked as the
              client&apos;s choice yet (that happens later, from Open Projects). This is a mock save (Part 2 shell):
              no real pricing engine or backend persistence is wired yet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setFinalizeConfirmOpen(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Keep Editing
            </button>
            <button
              type="button"
              onClick={() => {
                setFinalizeConfirmOpen(false);
                // P2-B — saves BOTH tiers (siblings of one quote_group_id), neither
                // is_selected — see savedProjectsStore.ts. Uses the CURRENT tierItems
                // (whatever Minor Revision left them as), not a fresh re-derivation.
                saveFinalizedQuotation({
                  clientId: client.client_id,
                  clientName: client.client_name,
                  projectName: quotation.project_name,
                  projectLocation: quotation.project_location,
                  projectRegion: quotation.project_region,
                  tierItems,
                  pricelistBasis,
                  segments,
                  blueprintFloors,
                });
                onFinalize();
              }}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
            >
              Finalize
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}