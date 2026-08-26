"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Award, Building2, CheckCircle2, ChevronDown, Clock, Database, FileText, Mail, MapPin, PenLine, Phone, Save, Shield, SlidersHorizontal, Star, TrendingDown, UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuotationBreakdownModal } from "./QuotationBreakdownModal";
import { MinorRevisionPanel } from "./MinorRevisionPanel";
import { computeTierResult, deriveCompanyRuleItemLines, deriveMockItemLines, fmtPeso, recomputeItemLine } from "@/lib/dev/provisional/quotationBreakdownFixtures";
import { saveFinalizedQuotation } from "@/lib/dev/provisional/savedProjectsStore";
import { PROVISIONAL_TIERS, type PricelistBasis, type ProvisionalItemLine, type ProvisionalQuotationTierResult, type ProvisionalTier } from "@/lib/dev/provisional/quotationBreakdownTypes";
import { apiClient } from "@/lib/api/client";
import { useLaborRules, useMaterialRules, usePricingStrategies, useUnitRules } from "@/lib/dev/provisional/useCompanyRulesProvisional";
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
  onBack: () => void;
  /** Saves the current unfinished quotation as Draft and returns to Open Projects. */
  onSaveDraft: () => void;
  /** Fires once the finalized project has actually been saved (P2-B) — caller only needs
   * to move the wizard on; the save itself already happened here. */
  onFinalize: () => void;
}

const TIER_META: Record<ProvisionalTier, { tagline: string; badge: string; accent: string; headerBg: string; accentBg: string }> = {
  Practical: {
    tagline: "Cost-effective solution with quality materials",
    badge: "Recommended",
    accent: "text-primary",
    headerBg: "project-tier-gradient bg-linear-to-r from-primary via-orange-400 to-primary",
    accentBg: "bg-orange-50",
  },
  Premium: {
    tagline: "High-spec materials with expedited delivery",
    badge: "Best Quality",
    accent: "text-[#0000CD]",
    headerBg: "project-tier-gradient bg-linear-to-r from-[#0000CD] via-[#4169E1] to-[#0000CD]",
    accentBg: "bg-[#0000CD]/5",
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
  { value: "Flag for manual review", label: "Flag for Manual Review", helper: "Keep missing prices visible so they can be resolved from the quotation card." },
];

function buildTierItems(tiers: ProvisionalTier[], makeItems: (tier: ProvisionalTier) => ProvisionalItemLine[]) {
  return Object.fromEntries(tiers.map((tier) => [tier, makeItems(tier)])) as Partial<Record<ProvisionalTier, ProvisionalItemLine[]>>;
}

function initTierItems(segments: DraftSegment[], basis: PricelistBasis, tiers: ProvisionalTier[]) {
  return buildTierItems(tiers, (tier) => deriveMockItemLines(segments, tier, basis));
}

function deriveTierItemsFromRules(
  segments: DraftSegment[],
  basis: PricelistBasis,
  materialRules: ReturnType<typeof useMaterialRules>["rules"],
  unitRules: ReturnType<typeof useUnitRules>["rules"],
  items: ReturnType<typeof useItemsCatalog>["items"],
  uploadedPrices: ReturnType<typeof usePricelistCatalog>["records"] = [],
  dpwhPrices: ReturnType<typeof usePricelistPublishedSource>["dpwhCatalog"]["records"] = [],
  tiers: ProvisionalTier[]
): Partial<Record<ProvisionalTier, ProvisionalItemLine[]>> {
  const companyRuleLines = deriveCompanyRuleItemLines(segments, materialRules, unitRules, items, basis, uploadedPrices, dpwhPrices);
  if (companyRuleLines) {
    return buildTierItems(tiers, (tier) =>
      companyRuleLines.map((line) => ({
        ...line,
        line_id: `${line.line_id}-${tier.toLowerCase()}`,
      }))
    );
  }
  return initTierItems(segments, basis, tiers);
}

function uniqueActiveTiers(strategies: ReturnType<typeof usePricingStrategies>["strategies"]): ProvisionalTier[] {
  const normalize = (tier: string): ProvisionalTier | null => {
    if (tier === "Premium" || tier === "Best") return "Premium";
    if (tier === "Practical" || tier === "Economic" || tier === "Good" || tier === "Better" || tier === "Economy") return "Practical";
    return null;
  };
  const active = strategies
    .filter((strategy) => strategy.is_active)
    .map((strategy) => normalize(strategy.quotation_tier))
    .filter((tier): tier is ProvisionalTier => tier !== null);
  const tiers = (active.length > 0 ? active : PROVISIONAL_TIERS).filter(
    (tier, index, list) => list.indexOf(tier) === index
  );
  return tiers.length > 0 ? tiers : PROVISIONAL_TIERS;
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
}: {
  tier: ProvisionalTier;
  result: ProvisionalQuotationTierResult;
  onViewBreakdown: () => void;
  onAccept: () => void;
}) {
  const meta = TIER_META[tier];
  const unresolvedCount = result.items.filter((l) => l.unit_price === null).length;

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
              {unresolvedCount} line{unresolvedCount === 1 ? "" : "s"} missing a rate. Resolve it from this quotation.
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
            { icon: Clock, label: "Lifespan", val: result.lifespan_label },
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
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 bg-gray-50 px-5 py-3.5">
        <button
          type="button"
          onClick={onViewBreakdown}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition hover:opacity-90 ${meta.headerBg}`}
        >
          Detailed Breakdown
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-bold text-gray-600 transition hover:border-primary hover:text-primary"
        >
          {unresolvedCount > 0 ? <PenLine className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {unresolvedCount > 0 ? `Resolve ${unresolvedCount} Missing Price${unresolvedCount === 1 ? "" : "s"}` : `Accept ${tier} Quotation`}
        </button>
      </div>
    </div>
  );
}

// P2-A/B/C/D — Generate's results screen: two tier cards (siblings of one
// ProvisionalQuoteGroup — see quotationBreakdownTypes.ts for the tier-linkage fields this
// depends on that don't exist in the schema yet), the READ-ONLY detailed breakdown (Part A),
// and the missing-price resolution flow. Everything
// downstream of `segments` is mock-derived — see quotationBreakdownFixtures.ts.
export function QuotationResultsStep({ client, quotation, segments, blueprintFloors, onStructuralRevision, onBack, onSaveDraft, onFinalize }: QuotationResultsStepProps) {
  const { strategies: pricingStrategies } = usePricingStrategies();
  const { rules: materialRules } = useMaterialRules();
  const { rules: laborRules } = useLaborRules();
  const { rules: unitRules } = useUnitRules();
  const { items } = useItemsCatalog();
  const { records: uploadedPrices, load: loadUploadedPrices } = usePricelistCatalog();
  const { dpwhCatalog } = usePricelistPublishedSource();
  const {
    records: dpwhPrices,
    load: loadDpwhPrices,
  } = dpwhCatalog;
  const [pricelistBasis, setPricelistBasis] = useState<PricelistBasis>(DEFAULT_BASIS);
  const activeTiers = useMemo(() => uniqueActiveTiers(pricingStrategies), [pricingStrategies]);
  const [tierItems, setTierItems] = useState(() => initTierItems(segments, DEFAULT_BASIS, PROVISIONAL_TIERS));
  const [hasManualLineEdits, setHasManualLineEdits] = useState(false);
  const [breakdownTier, setBreakdownTier] = useState<ProvisionalTier | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [prioritySource, setPrioritySource] = useState<QuotationPrioritySource>("Uploaded");
  const [fallbackRule, setFallbackRule] = useState<QuotationFallbackRule>("Use next available source");
  const [minorRevisionTier, setMinorRevisionTier] = useState<ProvisionalTier | null>(null);
  const [structuralConfirmOpen, setStructuralConfirmOpen] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false);

  const includedSegments = segments.filter(isSegmentIncluded);
  const totalArea = includedSegments.reduce((sum, s) => sum + s.area_sqm, 0);
  const floors = new Set(includedSegments.map((s) => s.floor_level || "—")).size;
  useEffect(() => {
    loadUploadedPrices();
    loadDpwhPrices();
  }, [loadDpwhPrices, loadUploadedPrices]);

  const autoTierItems = useMemo(
    () => deriveTierItemsFromRules(segments, pricelistBasis, materialRules, unitRules, items, uploadedPrices, dpwhPrices, activeTiers),
    [activeTiers, items, materialRules, pricelistBasis, segments, unitRules, uploadedPrices, dpwhPrices]
  );
  const effectiveTierItems = hasManualLineEdits ? tierItems : autoTierItems;

  // Part B/D — the Uploaded/DPWH toggle is shared by the read-only Breakdown view AND
  // Missing-price resolution; switching it re-prices every NON-overridden line to the new basis for
  // BOTH tiers at once (see retargetItemLinesBasis's doc — a manual override always wins).
  const handleBasisChange = (basis: PricelistBasis) => {
    setPricelistBasis(basis);
    setHasManualLineEdits(true);
    setTierItems(deriveTierItemsFromRules(segments, basis, materialRules, unitRules, items, uploadedPrices, dpwhPrices, activeTiers));
  };

  const handleApplyQuotationRules = () => {
    setHasManualLineEdits(true);
    handleBasisChange(prioritySource);
    const next = deriveTierItemsFromRules(segments, prioritySource, materialRules, unitRules, items, uploadedPrices, dpwhPrices, activeTiers);
    setTierItems(
      buildTierItems(activeTiers, (tier) => applyQuotationRuleToLines(next[tier] ?? [], prioritySource, fallbackRule))
    );
    setRuleDialogOpen(false);
  };

  const handlePrioritySourceChange = (source: QuotationPrioritySource) => {
    setPrioritySource(source);
    if (source === "Uploaded") setFallbackRule("Use next available source");
  };

  const tierResults = Object.fromEntries(
    activeTiers.map((tier) => [tier, computeTierResult(tier, effectiveTierItems[tier] ?? [], { segments, materialRules, laborRules })])
  ) as Partial<Record<ProvisionalTier, ProvisionalQuotationTierResult>>;

  const handleAcceptQuotation = async (tier: ProvisionalTier) => {
    const result = tierResults[tier];
    if (!result) return;

    if (result.items.some((item) => item.unit_price === null || item.total_cost === null)) {
      setAcceptError(null);
      setMinorRevisionTier(tier);
      return;
    }

    setAcceptError(null);
    try {
      await apiClient(`/api/quotations/${quotation.quote_id}/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          items: effectiveTierItems[tier] ?? [],
          total_material_cost: result.materials_subtotal,
          total_service_cost: result.service_cost.subtotal,
          grand_total: result.grand_total,
        }),
      });
      saveFinalizedQuotation({
        quoteId: quotation.quote_id,
        acceptedTier: tier,
        clientId: client.client_id,
        clientName: client.client_name,
        projectName: quotation.project_name,
        projectLocation: quotation.project_location,
        projectRegion: quotation.project_region,
        tierItems: effectiveTierItems,
        pricelistBasis,
        segments,
        materialRules,
        laborRules,
        blueprintFloors,
      });
      onFinalize();
    } catch (error) {
      setAcceptError(error instanceof Error ? error.message : "Could not accept this quotation.");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        title="Back"
        aria-label="Back"
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-primary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <section className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm" aria-labelledby="client-details-heading">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
            <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p id="client-details-heading" className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Client
              </p>
              <h3 className="truncate text-base font-semibold text-gray-900">{client.client_name}</h3>
            </div>
            </div>
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
              {[
                ["Project Name", quotation.project_name],
                ["Project Location", quotation.project_location],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-xl bg-gray-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-gray-700" title={value}>{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${client.status === "Active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
              {client.status}
            </span>
            <button
              type="button"
              onClick={() => setClientDetailsOpen((open) => !open)}
              title={clientDetailsOpen ? "Hide client contact details" : "Show client contact details"}
              aria-label={clientDetailsOpen ? "Hide client contact details" : "Show client contact details"}
              aria-expanded={clientDetailsOpen}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${clientDetailsOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
        {clientDetailsOpen && (
          <div className="grid gap-x-6 gap-y-3 pt-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { icon: UserRound, label: "Contact person", value: client.contact_person },
              { icon: Mail, label: "Email", value: client.contact_email },
              { icon: Phone, label: "Phone", value: client.contact_number },
              { icon: MapPin, label: "Address", value: client.client_address },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex min-w-0 items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
                  <p className="truncate text-xs font-medium text-gray-700" title={value || "Not provided"}>{value || "Not provided"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
            onClick={() => setRuleDialogOpen(true)}
            title="Source & Fallback"
            aria-label="Source & Fallback"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setStructuralConfirmOpen(true)}
            title="Modify Segments"
            aria-label="Modify Segments"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-orange-50/60 text-primary transition hover:bg-orange-50"
          >
            <PenLine className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onSaveDraft}
            title="Save Draft"
            aria-label="Save Draft"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-primary hover:text-primary"
          >
            <Save className="h-4 w-4" />
          </button>
        </div>
      </div>

      {acceptError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {acceptError}
        </p>
      )}

      <div className="flex flex-col gap-5 lg:flex-row">
        {activeTiers.map((tier) => {
          const result = tierResults[tier];
          if (!result) return null;
          return (
            <QuoteCard
              key={tier}
              tier={tier}
              result={result}
              onViewBreakdown={() => setBreakdownTier(tier)}
              onAccept={() => handleAcceptQuotation(tier)}
            />
          );
        })}
      </div>

      {breakdownTier && (
        // Part A — strictly read-only: no onItemsChange/onLinesChange prop exists on this
        // component at all anymore. See QuotationBreakdownModal.tsx.
        <QuotationBreakdownModal
          tier={breakdownTier}
          result={tierResults[breakdownTier]!}
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
                    onClick={() => handlePrioritySourceChange(value)}
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
                    disabled={prioritySource === "Uploaded" && option.value !== "Use next available source"}
                    className={`rounded-xl border p-3 text-left transition ${
                      fallbackRule === option.value ? "border-primary bg-orange-50" : "border-gray-200 bg-white hover:bg-gray-50"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
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

      {minorRevisionTier && (
        <MinorRevisionPanel
          tier={minorRevisionTier}
          originalItems={autoTierItems[minorRevisionTier] ?? []}
          items={effectiveTierItems[minorRevisionTier] ?? []}
          onItemsChange={(next) => {
            setHasManualLineEdits(true);
            setTierItems((prev) => ({ ...prev, [minorRevisionTier]: next }));
          }}
          onClose={() => setMinorRevisionTier(null)}
          onApply={() => setMinorRevisionTier(null)}
        />
      )}

      <Dialog open={structuralConfirmOpen} onOpenChange={setStructuralConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modify segments?</DialogTitle>
            <DialogDescription>
              You return to review segments with your previous data. Any quotations generated here are discarded and
              regenerated when you proceed.
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
              Modify Segments
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
