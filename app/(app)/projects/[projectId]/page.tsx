"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Award, CheckCircle2, Clock, Shield, Star, TrendingDown } from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { QuotationBreakdownModal } from "@/features/quotation-generation/components/QuotationBreakdownModal";
import { fmtPeso } from "@/lib/dev/provisional/quotationBreakdownFixtures";
import { setAcceptedTier, useSavedProjects } from "@/lib/dev/provisional/savedProjectsStore";
import type { SavedProjectRecord } from "@/lib/dev/provisional/savedProjectsTypes";
import type { ProvisionalTier } from "@/lib/dev/provisional/quotationBreakdownTypes";

// PART D — PDF EXPORT ROADMAP (NOT BUILT — post-defense scope, depends on the real
// derivation engine landing first). Two variants are planned once that's real:
//   - INTERNAL: full transparency — markups, base prices, and the whole cost buildup
//     visible, for the contractor's own records.
//   - EXTERNAL: client-facing — markups and base prices hidden, totals only, suitable to
//     actually hand to a client.
// The natural seam is right here, next to "View Breakdown" on each tier card below — an
// "Export PDF" action per tier, branching into those two variants. Do not build against
// mock fixture data; a PDF implies "this is the real number," which these aren't yet.

const TIER_META: Record<ProvisionalTier, { accent: string; headerBg: string; accentBg: string; badge: string }> = {
  Practical: { accent: "text-primary", headerBg: "bg-primary", accentBg: "bg-orange-50", badge: "Recommended" },
  Premium: { accent: "text-indigo-600", headerBg: "bg-indigo-600", accentBg: "bg-indigo-50", badge: "Best Quality" },
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function QuoteSummaryCard({
  project,
  tier,
  onViewBreakdown,
  onToggleAccepted,
}: {
  project: SavedProjectRecord;
  tier: ProvisionalTier;
  onViewBreakdown: () => void;
  onToggleAccepted: () => void;
}) {
  const meta = TIER_META[tier];
  // Snapshot integrity — this reads project.quotes[tier].result AS STORED. Nothing here
  // calls computeTierResult/deriveMockItemLines again; a saved quote shows exactly what it
  // showed when it was finalized, not what today's fixtures would produce.
  const snapshot = project.quotes[tier];
  const { result } = snapshot;
  const accepted = snapshot.is_selected === true;

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
          <p className="text-[10px] uppercase tracking-widest opacity-70">Total (incl. VAT) — as finalized</p>
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
          Finalized {formatDateTime(snapshot.finalized_at)} · priced from {snapshot.pricelist_basis_at_finalize === "Uploaded" ? "Uploaded Pricelist" : "DPWH CMPD"}
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3.5">
        <button
          type="button"
          onClick={onViewBreakdown}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition hover:opacity-90 ${meta.headerBg}`}
        >
          View Breakdown
        </button>
        {/* Part C — a flag the CONTRACTOR sets once the client has actually chosen; not a
            workflow, no notifications, nothing client-facing. */}
        <button
          type="button"
          onClick={onToggleAccepted}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2 text-xs font-bold transition ${
            accepted ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100" : "border-gray-200 bg-white text-gray-500 hover:border-primary hover:text-primary"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> {accepted ? "Accepted — click to unmark" : "Mark as Accepted"}
        </button>
      </div>
    </div>
  );
}

function ProjectDetailContent({ projectId }: { projectId: string }) {
  const router = useRouter();
  const projects = useSavedProjects();
  const project = projects.find((p) => p.project_id === projectId);
  const [breakdownTier, setBreakdownTier] = useState<ProvisionalTier | null>(null);

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
        {[
          { label: "Status", value: project.status },
          { label: "Region", value: project.project_region },
          { label: "Created", value: formatDateTime(project.created_at) },
          { label: "Last Updated", value: formatDateTime(project.updated_at) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
            <p className="mt-0.5 text-sm font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        <QuoteSummaryCard project={project} tier="Practical" onViewBreakdown={() => setBreakdownTier("Practical")} onToggleAccepted={() => handleToggleAccepted("Practical")} />
        <QuoteSummaryCard project={project} tier="Premium" onViewBreakdown={() => setBreakdownTier("Premium")} onToggleAccepted={() => handleToggleAccepted("Premium")} />
      </div>

      {breakdownTier && (
        // Part C — REUSES QuotationBreakdownModal exactly as built for the live wizard, not
        // a duplicate. `onBasisChange` is intentionally omitted: this is a frozen, saved
        // snapshot, so the Pricelist Basis control renders as a static "as finalized" badge
        // instead of a working toggle (see that component's prop doc).
        <QuotationBreakdownModal
          tier={breakdownTier}
          result={project.quotes[breakdownTier].result}
          pricelistBasis={project.quotes[breakdownTier].pricelist_basis_at_finalize}
          onClose={() => setBreakdownTier(null)}
        />
      )}
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
