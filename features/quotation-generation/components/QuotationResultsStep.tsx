"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Award, CheckCircle2, Clock, Database, FileText, PenLine, Save, Shield, SlidersHorizontal, Star, TrendingDown } from "lucide-react";
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
import { computeTierResult, deriveCompanyRuleItemLines, deriveMockItemLines, fmtPeso, recomputeItemLine } from "@/lib/dev/provisional/quotationBreakdownFixtures";
import { PROVISIONAL_TIERS, type PricelistBasis, type ProvisionalItemLine, type ProvisionalQuotationTierResult, type ProvisionalTier } from "@/lib/dev/provisional/quotationBreakdownTypes";
import { saveDraftQuotation, saveFinalizedQuotation, setAcceptedTier } from "@/lib/dev/provisional/savedProjectsStore";
import { useLaborRules, useMaterialRules, useUnitRules } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useItemsCatalog } from "@/hooks/useItemsCatalog";
import { usePricelistCatalog } from "@/hooks/usePricelistCatalog";
import { usePricelistPublishedSource } from "@/hooks/usePricelistPublishedSource";
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
  onFinalize: (projectId: string) => void;
  onSaveDraft?: (projectId: string) => void;
}

const TIER_META: Record<ProvisionalTier, { tagline: string; badge: string; accent: string; headerBg: string; accentBg: string; acceptButton: string; breakdownButton: string }> = {
  Practical: {
    tagline: "Cost-effective solution with quality materials",
    badge: "Recommended",
    accent: "text-primary",
    headerBg: "bg-primary",
    accentBg: "bg-orange-50",
    acceptButton: "border-primary text-primary hover:bg-orange-50",
    breakdownButton: "hover:border-primary hover:text-primary",
  },
  Premium: {
    tagline: "High-spec materials with expedited delivery",
    badge: "Best Quality",
    accent: "text-indigo-600",
    headerBg: "bg-indigo-600",
    accentBg: "bg-indigo-50",
    acceptButton: "border-indigo-600 text-indigo-600 hover:bg-indigo-50",
    breakdownButton: "hover:border-indigo-600 hover:text-indigo-600",
  },
};

const DEFAULT_BASIS: PricelistBasis = "Uploaded";
type QuotationPrioritySource = "Uploaded" | "DPWH";
type QuotationFallbackRule = "Use next available source" | "Use lowest uploaded rate" | "Flag for manual review";

const SOURCE_OPTIONS: { value: QuotationPrioritySource; label: string; icon: typeof FileText }[] = [
  { value: "Uploaded", label: "Supplier", icon: FileText },
  { value: "DPWH", label: "DPWH CMPD", icon: Database },
];

const FALLBACK_OPTIONS: { value: QuotationFallbackRule; label: string; helper: string }[] = [
  { value: "Use next available source", label: "Next Available Source", helper: "Try the selected source first, then use the other source when a line is missing a rate." },
  { value: "Use lowest uploaded rate", label: "Lowest Uploaded Rate", helper: "Use the lowest matching rate from the uploaded pricelist entries for each material." },
  { value: "Flag for manual review", label: "Flag for Manual Review", helper: "Keep missing prices visible for Minor Revision instead of auto-substituting." },
];

function initTierItems(segments: DraftSegment[], basis: PricelistBasis): Record<ProvisionalTier, ProvisionalItemLine[]> {
  return {
    Practical: deriveMockItemLines(segments, "Practical", basis),
    Premium: deriveMockItemLines(segments, "Premium", basis),
  };
}

function deriveTierItemsFromRules(
  segments: DraftSegment[],
  basis: PricelistBasis,
  materialRules: ReturnType<typeof useMaterialRules>["rules"],
  laborRules: ReturnType<typeof useLaborRules>["rules"],
  unitRules: ReturnType<typeof useUnitRules>["rules"],
  items: ReturnType<typeof useItemsCatalog>["items"],
  uploadedPrices: ReturnType<typeof usePricelistCatalog>["records"] = [],
  dpwhPrices: ReturnType<typeof usePricelistPublishedSource>["dpwhCatalog"]["records"] = []
): Record<ProvisionalTier, ProvisionalItemLine[]> {
  const companyRuleLines = deriveCompanyRuleItemLines(segments, materialRules, laborRules, unitRules, items, basis, uploadedPrices, dpwhPrices);
  if (companyRuleLines) {
    return {
      Practical: companyRuleLines,
      Premium: companyRuleLines.map((line) => ({
        ...line,
        line_id: `${line.line_id}-premium`,
      })),
    };
  }
  return initTierItems(segments, basis);
}

function applyQuotationRuleToLines(
  lines: ProvisionalItemLine[],
  prioritySource: QuotationPrioritySource,
  fallbackRule: QuotationFallbackRule
): ProvisionalItemLine[] {
  return lines.map((line) => {
    const uploadedOptions = line.supplier_options.filter((option) => option.source_type === "Uploaded");
    const dpwhOptions = line.supplier_options.filter((option) => option.source_type === "DPWH");
    const cheapestUploaded = uploadedOptions.length > 0
      ? [...uploadedOptions].sort((a, b) => a.unit_price - b.unit_price)[0]
      : null;
    const cheapestDpwh = dpwhOptions.length > 0
      ? [...dpwhOptions].sort((a, b) => a.unit_price - b.unit_price)[0]
      : null;
    const nextAvailable = prioritySource === "Uploaded" ? cheapestDpwh : cheapestUploaded;
    const chosenOption =
      fallbackRule === "Use lowest uploaded rate"
        ? cheapestUploaded
        : fallbackRule === "Use next available source" && line.unit_price === null
          ? nextAvailable
          : null;

    if (chosenOption) {
      return recomputeItemLine(line, {
        selected_supplier_id: chosenOption.supplier_id,
        unit_price: chosenOption.unit_price,
        source_type: chosenOption.source_type,
      });
    }

    return line;
  });
}

function QuoteCard({
  tier,
  result,
  onViewBreakdown,
  onAccept,
  isAccepting,
}: {
  tier: ProvisionalTier;
  result: ProvisionalQuotationTierResult;
  onViewBreakdown: () => void;
  onAccept: () => void;
  isAccepting: boolean;
}) {
  const meta = TIER_META[tier];
  const unresolvedCount = result.items.filter((l) => l.unit_price === null).length;
  const canAccept = unresolvedCount === 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border-2 border-gray-100 bg-white shadow-sm">
      <div className={`${meta.headerBg} px-5 py-4 text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
              {tier === "Practical" ? "Option A" : "Option B"}
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
              {unresolvedCount} line{unresolvedCount === 1 ? "" : "s"} missing a rate. Resolve in Minor Revision.
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

      <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3.5">
        <button
          type="button"
          onClick={onViewBreakdown}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-bold text-gray-600 transition ${meta.breakdownButton}`}
        >
          View Detailed Breakdown
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={!canAccept || isAccepting}
          title={!canAccept ? "Resolve missing prices before accepting this quotation." : undefined}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border bg-white py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-55 ${meta.acceptButton}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isAccepting ? "Accepting..." : "Mark as Accepted"}
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
export function QuotationResultsStep({ client, quotation, segments, blueprintFloors, onStructuralRevision, onFinalize, onSaveDraft }: QuotationResultsStepProps) {
  const { rules: materialRules, isLoading: materialRulesLoading } = useMaterialRules();
  const { rules: laborRules, isLoading: laborRulesLoading } = useLaborRules();
  const { rules: unitRules, isLoading: unitRulesLoading } = useUnitRules();
  const { items, isLoading: itemsLoading } = useItemsCatalog();
  const { records: uploadedPrices, isLoading: uploadedPricesLoading, load: loadUploadedPrices } = usePricelistCatalog();
  const { dpwhCatalog } = usePricelistPublishedSource();
  const {
    records: dpwhPrices,
    isLoading: dpwhPricesLoading,
    load: loadDpwhPrices,
  } = dpwhCatalog;
  const [pricelistBasis, setPricelistBasis] = useState<PricelistBasis>(DEFAULT_BASIS);
  const [tierItems, setTierItems] = useState(() => initTierItems(segments, DEFAULT_BASIS));
  const [hasManualLineEdits, setHasManualLineEdits] = useState(false);
  const [breakdownTier, setBreakdownTier] = useState<ProvisionalTier | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [prioritySource, setPrioritySource] = useState<QuotationPrioritySource>("Uploaded");
  const [fallbackRule, setFallbackRule] = useState<QuotationFallbackRule>("Use next available source");
  const [revisionTypeOpen, setRevisionTypeOpen] = useState(false);
  const [minorRevisionTier, setMinorRevisionTier] = useState<ProvisionalTier | null>(null);
  const [structuralConfirmOpen, setStructuralConfirmOpen] = useState(false);
  const [acceptTier, setAcceptTier] = useState<ProvisionalTier | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const finalizedOrSavedRef = useRef(false);
  const latestDraftInputRef = useRef<Parameters<typeof saveDraftQuotation>[0] | null>(null);

  const includedSegments = segments.filter(isSegmentIncluded);
  const totalArea = includedSegments.reduce((sum, s) => sum + s.area_sqm, 0);
  const floors = new Set(includedSegments.map((s) => s.floor_level || "—")).size;
  useEffect(() => {
    loadUploadedPrices();
    loadDpwhPrices();
  }, [loadDpwhPrices, loadUploadedPrices]);

  const cprmLoading = materialRulesLoading || laborRulesLoading || unitRulesLoading || itemsLoading || uploadedPricesLoading || dpwhPricesLoading;
  const cprmHasTreatmentMatches = useMemo(
    () =>
      segments.some((seg) =>
        materialRules.some(
          (rule) =>
            rule.is_active &&
            !!rule.treatment_type &&
            rule.treatment_type.trim().toLowerCase() === seg.treatment_type?.trim().toLowerCase()
        )
      ),
    [materialRules, segments]
  );

  const autoTierItems = useMemo(
    () => deriveTierItemsFromRules(segments, pricelistBasis, materialRules, laborRules, unitRules, items, uploadedPrices, dpwhPrices),
    [items, laborRules, materialRules, pricelistBasis, segments, unitRules, uploadedPrices, dpwhPrices]
  );
  const effectiveTierItems = hasManualLineEdits ? tierItems : autoTierItems;

  // Part B/D — the Uploaded/DPWH toggle is shared by the read-only Breakdown view AND
  // Minor Revision; switching it re-prices every NON-overridden line to the new basis for
  // BOTH tiers at once (see retargetItemLinesBasis's doc — a manual override always wins).
  const handleBasisChange = (basis: PricelistBasis) => {
    setPricelistBasis(basis);
    setHasManualLineEdits(true);
    setTierItems(deriveTierItemsFromRules(segments, basis, materialRules, laborRules, unitRules, items, uploadedPrices, dpwhPrices));
  };

  const handleApplyQuotationRules = () => {
    setHasManualLineEdits(true);
    handleBasisChange(prioritySource);
    setTierItems(() => ({
      Practical: applyQuotationRuleToLines(
        deriveTierItemsFromRules(segments, prioritySource, materialRules, laborRules, unitRules, items, uploadedPrices, dpwhPrices).Practical,
        prioritySource,
        fallbackRule
      ),
      Premium: applyQuotationRuleToLines(
        deriveTierItemsFromRules(segments, prioritySource, materialRules, laborRules, unitRules, items, uploadedPrices, dpwhPrices).Premium,
        prioritySource,
        fallbackRule
      ),
    }));
    setRuleDialogOpen(false);
  };

  const tierResults: Record<ProvisionalTier, ProvisionalQuotationTierResult> = {
    Practical: computeTierResult("Practical", effectiveTierItems.Practical),
    Premium: computeTierResult("Premium", effectiveTierItems.Premium),
  };

  const draftInput = useMemo(
    () => ({
      clientId: client.client_id,
      clientName: client.client_name,
      projectName: quotation.project_name,
      projectLocation: quotation.project_location,
      projectRegion: quotation.project_region,
      tierItems: effectiveTierItems,
      pricelistBasis,
      segments,
      blueprintFloors,
      quoteId: quotation.quote_id,
    }),
    [blueprintFloors, client.client_id, client.client_name, effectiveTierItems, pricelistBasis, quotation.project_location, quotation.project_name, quotation.project_region, quotation.quote_id, segments]
  );

  useEffect(() => {
    latestDraftInputRef.current = draftInput;
  }, [draftInput]);

  useEffect(() => {
    return () => {
      if (finalizedOrSavedRef.current || !latestDraftInputRef.current) return;
      saveDraftQuotation(latestDraftInputRef.current);
    };
  }, []);

  const acceptSelectedTier = async () => {
    if (!acceptTier || isAccepting) return;
    const result = tierResults[acceptTier];
    const unresolvedCount = result.items.filter((line) => line.unit_price === null).length;
    if (unresolvedCount > 0) {
      setAcceptError("Resolve all missing prices before accepting this quotation.");
      return;
    }

    setIsAccepting(true);
    setAcceptError(null);
    try {
      const response = await fetch(`/api/quotations/${quotation.quote_id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: acceptTier,
          items: result.items.map((line) => ({
            item_code: line.item_code,
            category: line.category,
            quantity: line.quantity,
            unit_price: line.unit_price,
            total_cost: line.total_cost,
            source_type: line.source_type,
            source_price_id: line.selected_supplier_id,
          })),
          total_material_cost: result.materials_subtotal,
          total_service_cost: result.service_cost.subtotal,
          grand_total: result.grand_total,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Could not accept quotation.");

      const savedProject = saveFinalizedQuotation({
        clientId: client.client_id,
        clientName: client.client_name,
        projectName: quotation.project_name,
        projectLocation: quotation.project_location,
        projectRegion: quotation.project_region,
        tierItems: effectiveTierItems,
        pricelistBasis,
        segments,
        blueprintFloors,
        quoteId: quotation.quote_id,
      });
      finalizedOrSavedRef.current = true;
      setAcceptedTier(savedProject.project_id, acceptTier);
      onFinalize(savedProject.project_id);
    } catch (error) {
      setAcceptError(error instanceof Error ? error.message : "Could not accept quotation.");
    } finally {
      setIsAccepting(false);
    }
  };

  const saveDraft = () => {
    if (isSavingDraft) return;
    setIsSavingDraft(true);
    const savedProject = saveDraftQuotation(latestDraftInputRef.current!);
    setIsSavingDraft(false);
    onSaveDraft?.(savedProject.project_id);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Generated Quotations</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Based on <span className="font-semibold text-gray-700">{includedSegments.length} segments · {totalArea.toFixed(1)} sqm · {floors} floor{floors === 1 ? "" : "s"}</span>.
            choose the plan that fits your budget.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Source & Fallback"
            title="Source & Fallback Rules"
            onClick={() => setRuleDialogOpen(true)}
            className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Edit Quotation"
            title="Edit"
            onClick={() => setRevisionTypeOpen(true)}
            className="flex items-center justify-center rounded-lg border border-primary/30 bg-orange-50/60 p-2 text-primary transition hover:bg-orange-50"
          >
            <PenLine className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={isSavingDraft ? "Saving Draft" : "Save Quotation"}
            title={isSavingDraft ? "Saving Draft" : "Save Quotation"}
            onClick={saveDraft}
            disabled={isSavingDraft}
            className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-500 shadow-sm">
        <span className="font-bold uppercase tracking-wide text-gray-400">Active material rule</span>
        <span className={`rounded-full px-2 py-1 font-semibold ${cprmHasTreatmentMatches ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          {cprmLoading ? "Checking CPRM..." : cprmHasTreatmentMatches ? "CPRM treatment match" : "Mock fallback"}
        </span>
        <span className="rounded-full bg-orange-50 px-2 py-1 font-semibold text-primary">
          Priority: {SOURCE_OPTIONS.find((o) => o.value === prioritySource)?.label}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-1 font-semibold text-gray-600">
          Fallback: {fallbackRule}
        </span>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        {PROVISIONAL_TIERS.map((tier) => (
          <QuoteCard
            key={tier}
            tier={tier}
            result={tierResults[tier]}
            onViewBreakdown={() => setBreakdownTier(tier)}
            onAccept={() => setAcceptTier(tier)}
            isAccepting={isAccepting && acceptTier === tier}
          />
        ))}
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

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Material Source &amp; Fallback</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Priority Source</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SOURCE_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPrioritySource(value)}
                    className={`flex min-h-20 flex-col items-start justify-between rounded-xl border p-3 text-left transition ${
                      prioritySource === value ? "border-primary bg-orange-50 text-primary" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-bold">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Fallback Rule</p>
              <div className="flex flex-col gap-2">
                {FALLBACK_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFallbackRule(option.value)}
                    className={`rounded-xl border p-3 text-left transition ${
                      fallbackRule === option.value ? "border-primary bg-orange-50" : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <span className={`text-sm font-bold ${fallbackRule === option.value ? "text-primary" : "text-gray-800"}`}>{option.label}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{option.helper}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRuleDialogOpen(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyQuotationRules}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
            >
              Apply to Quotation
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {revisionTypeOpen && (
        <RevisionTypeModal
          onClose={() => setRevisionTypeOpen(false)}
          onStructural={() => {
            setRevisionTypeOpen(false);
            setStructuralConfirmOpen(true);
          }}
          onMinor={() => {
            setRevisionTypeOpen(false);
            setMinorRevisionTier("Practical");
          }}
        />
      )}

      {minorRevisionTier && (
        <MinorRevisionPanel
          key={minorRevisionTier}
          tier={minorRevisionTier}
          originalItems={autoTierItems[minorRevisionTier]}
          items={effectiveTierItems[minorRevisionTier]}
          onItemsChange={(next) => {
            setHasManualLineEdits(true);
            const otherTier: ProvisionalTier = minorRevisionTier === "Practical" ? "Premium" : "Practical";
            const currentItems = effectiveTierItems[minorRevisionTier];
            const sharedRevisions = new Map(
              next
                .map((line) => {
                  const previous = currentItems.find((item) => item.line_id === line.line_id);
                  const lineChanged =
                    previous &&
                    (previous.item_name !== line.item_name ||
                      previous.quantity !== line.quantity ||
                      previous.unit_price !== line.unit_price ||
                      previous.selected_supplier_id !== line.selected_supplier_id ||
                      previous.source_type !== line.source_type);
                  return lineChanged
                    ? [
                        `${line.segment_draft_id}:${line.item_code}`,
                        {
                          item_name: line.item_name,
                          quantity: line.quantity,
                          unit_price: line.unit_price,
                          selected_supplier_id: line.selected_supplier_id,
                          source_type: line.source_type,
                        },
                      ] as const
                    : null;
                })
                .filter((change): change is NonNullable<typeof change> => change !== null)
            );

            setTierItems((prev) => {
              const base = hasManualLineEdits ? prev : autoTierItems;
              return {
                ...base,
                [minorRevisionTier]: next,
                [otherTier]: base[otherTier].map((line) => {
                  const revision = sharedRevisions.get(`${line.segment_draft_id}:${line.item_code}`);
                  return revision ? recomputeItemLine(line, revision) : line;
                }),
              };
            });
          }}
          onTierChange={setMinorRevisionTier}
          onClose={() => setMinorRevisionTier(null)}
          onApply={() => setMinorRevisionTier(null)}
        />
      )}

      <Dialog open={structuralConfirmOpen} onOpenChange={setStructuralConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to segmentation?</DialogTitle>
            <DialogDescription>
              All quotations will be discarded. 
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

      <Dialog open={acceptTier !== null} onOpenChange={(open) => {
        if (!open && !isAccepting) {
          setAcceptTier(null);
          setAcceptError(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept {acceptTier} Quotation?</DialogTitle>
            <DialogDescription>
              This would save the quotation as finalized project.
            </DialogDescription>
          </DialogHeader>
          {acceptError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {acceptError}
            </div>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setAcceptTier(null);
                setAcceptError(null);
              }}
              disabled={isAccepting}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Keep Editing
            </button>
            <button
              type="button"
              onClick={acceptSelectedTier}
              disabled={isAccepting}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
            >
              {isAccepting ? "Accepting..." : `Accept ${acceptTier ?? ""}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
