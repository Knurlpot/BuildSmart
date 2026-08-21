"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Award, CheckCircle2, Clock, History, RefreshCw, Shield, Star, TrendingDown } from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { QuotationBreakdownModal } from "@/features/quotation-generation/components/QuotationBreakdownModal";
import { fmtPeso } from "@/lib/dev/provisional/quotationBreakdownFixtures";
import { refreshQuotePrices, setAcceptedTier, useSavedProjects } from "@/lib/dev/provisional/savedProjectsStore";
import type { SavedProjectRecord, SavedQuoteVersion } from "@/lib/dev/provisional/savedProjectsTypes";
import type { ProvisionalTier } from "@/lib/dev/provisional/quotationBreakdownTypes";


// 
const TIER_META: Record<ProvisionalTier, { accent: string; headerBg: string; accentBg: string; badge: string }> = {
  Practical: { accent: "text-primary", headerBg: "bg-primary", accentBg: "bg-orange-50", badge: "Recommended" },
  Premium: { accent: "text-indigo-600", headerBg: "bg-indigo-600", accentBg: "bg-indigo-50", badge: "Best Quality" },
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function versionLabel(v: SavedQuoteVersion): string {
  return v.version_number === 1 ? "Original (as finalized)" : `Refreshed v${v.version_number}`;
}

function QuoteSummaryCard({
  project,
  tier,
  onViewBreakdown,
  onToggleAccepted,
}: {
  project: SavedProjectRecord;
  tier: ProvisionalTier;
  onViewBreakdown: (versionId: string) => void;
  onToggleAccepted: () => void;
}) {
  const meta = TIER_META[tier];
  const snapshot = project.quotes[tier];
  const accepted = snapshot.is_selected === true;
  const canChooseAcceptedTier = project.status !== "Final";
  const versions = snapshot.versions;
  const latest = versions[versions.length - 1];

  // 
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
  const displayed = versions.find((v) => v.version_id === viewingVersionId) ?? latest;
  const { result } = displayed;
  const isOriginal = displayed.version_number === 1;
  const displayedVersionLabel = isOriginal && project.status === "Draft" ? "Draft estimate" : versionLabel(displayed);

  return (
    <div className={`flex flex-1 flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-sm ${accepted ? "border-green-300" : "border-gray-100"}`}>
      <div className={`${meta.headerBg} px-5 py-4 text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest opacity-80">{tier === "Practical" ? "Option A" : "Option B"}</span>
            <h2 className="text-xl font-bold leading-tight">{tier}</h2>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold backdrop-blur">{meta.badge}</span>
            {tier === "Premium" ? <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" /> : <TrendingDown className="h-4 w-4 text-white/80" />}
          </div>
        </div>
        <div className="mt-3 border-t border-white/20 pt-3">
          <p className="text-[10px] uppercase tracking-widest opacity-70">
            Total (incl. VAT): {isOriginal ? (project.status === "Final" ? "as finalized" : "draft estimate") : displayedVersionLabel}
          </p>
          <p className="text-2xl font-extrabold">{fmtPeso(result.grand_total)}</p>
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
        <p className="text-[11px] text-gray-400">
          {project.status === "Final" ? "Finalized" : "Saved as draft"} {formatDateTime(snapshot.finalized_at)}
        </p>

        {/* Price-reference date + version history. The ORIGINAL is always
            reachable here; refreshing never removes it, only adds beside it. */}
        <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <History className="h-3 w-3" /> Price Reference
            </span>
            {versions.length > 1 && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-600">{versions.length} versions</span>
            )}
          </div>
          <p className="text-xs text-gray-600">
            Viewing <strong>{displayedVersionLabel}</strong> · prices as of {formatDateTime(displayed.price_reference_date)}
          </p>
          {versions.length > 1 && (
            <select
              value={displayed.version_id}
              onChange={(e) => setViewingVersionId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {versions.map((v) => (
                <option key={v.version_id} value={v.version_id}>
                  {versionLabel(v)} — {formatDateTime(v.price_reference_date)} — {fmtPeso(v.result.grand_total)}
                </option>
              ))}
            </select>
          )}
          {!isOriginal && (
            <p className="text-[10px] text-gray-400">
              The version finalized on {formatDateTime(snapshot.finalized_at)} is preserved. Refreshing never overwrites it.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3.5">
        <button
          type="button"
          onClick={() => onViewBreakdown(displayed.version_id)}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition hover:opacity-90 ${meta.headerBg}`}
        >
          View Breakdown
        </button>

        {canChooseAcceptedTier && (
          <button
            type="button"
            onClick={onToggleAccepted}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2 text-xs font-bold transition ${
              accepted ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100" : "border-gray-200 bg-white text-gray-500 hover:border-primary hover:text-primary"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> {accepted ? "Accepted. Click to unmark" : "Mark as Accepted"}
          </button>
        )}
      </div>
    </div>
  );
}

function ProjectDetailContent({ projectId }: { projectId: string }) {
  const router = useRouter();
  const projects = useSavedProjects();
  const project = projects.find((p) => p.project_id === projectId);
  const [breakdown, setBreakdown] = useState<{ tier: ProvisionalTier; versionId: string } | null>(null);

  if (!project) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm font-semibold text-gray-500">Project not found</p>
        <p className="text-xs text-gray-400">It may have been removed, or this link is stale.</p>
        <button type="button" onClick={() => router.push("/projects")} className="mt-2 text-sm font-semibold text-primary hover:underline">
          Back to Open Projects
        </button>
      </div>
    );
  }

  const handleToggleAccepted = (tier: ProvisionalTier) => {
    const alreadyAccepted = project.quotes[tier].is_selected === true;
    setAcceptedTier(project.project_id, alreadyAccepted ? null : tier);
  };

  const handleRefresh = () => {
    refreshQuotePrices(project.project_id, "Practical");
    refreshQuotePrices(project.project_id, "Premium");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => router.push("/projects")}
          title="Back to Open Projects"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{project.project_name}</h1>
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-700">{project.client_name}</span> · {project.project_location}, {project.project_region}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Status</p>
          <p className="mt-0.5 text-sm font-bold text-gray-800">{project.status}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Region</p>
          <p className="mt-0.5 text-sm font-bold text-gray-800">{project.project_region}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Created</p>
          <p className="mt-0.5 text-sm font-bold text-gray-800">{formatDateTime(project.created_at)}</p>
        </div>
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Last Updated</p>
            <p className="mt-0.5 truncate text-sm font-bold text-gray-800">{formatDateTime(project.updated_at)}</p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh Practical and Premium prices"
            className="flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 text-[10px] font-bold text-gray-600 shadow-sm transition hover:border-primary hover:text-primary"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        <QuoteSummaryCard
          project={project}
          tier="Practical"
          onViewBreakdown={(versionId) => setBreakdown({ tier: "Practical", versionId })}
          onToggleAccepted={() => handleToggleAccepted("Practical")}
        />
        <QuoteSummaryCard
          project={project}
          tier="Premium"
          onViewBreakdown={(versionId) => setBreakdown({ tier: "Premium", versionId })}
          onToggleAccepted={() => handleToggleAccepted("Premium")}
        />
      </div>

      {breakdown &&
        (() => {

          // 
          const snapshot = project.quotes[breakdown.tier];
          const version = snapshot.versions.find((v) => v.version_id === breakdown.versionId) ?? snapshot.versions[snapshot.versions.length - 1];
          return (
            // REUSES QuotationBreakdownModal exactly as built for the live wizard, not a
            // duplicate. `onBasisChange` is intentionally omitted: this is a frozen, saved
            // snapshot, so the Pricelist Basis control renders as a static "as finalized"
            // badge instead of a working toggle (see that component's prop doc).
            <QuotationBreakdownModal
              tier={breakdown.tier}
              result={version.result}
              pricelistBasis={snapshot.pricelist_basis_at_finalize}
              onClose={() => setBreakdown(null)}
              // Same split-view Segment Breakdown preview the live wizard
              // shows, sourced from what was frozen at Finalize. null blueprintFloors
              // degrades gracefully to the segment list (see SegmentBreakdownTab).
              blueprintFloors={project.blueprintFloors}
              segments={project.segmentsSnapshot}
            />
          );
        })()}
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  return (
    <RequireOnboardingStep minStep={2}>
      <ProjectDetailContent projectId={params.projectId} />
    </RequireOnboardingStep>
  );
}
