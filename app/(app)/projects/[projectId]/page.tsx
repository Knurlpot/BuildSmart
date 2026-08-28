"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock,
  History,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Shield,
  Star,
  TrendingDown,
  UserRound,
} from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { QuotationBreakdownModal } from "@/features/quotation-generation/components/QuotationBreakdownModal";
import { fmtPeso } from "@/lib/dev/provisional/quotationBreakdownFixtures";
import { refreshQuotePrices, setAcceptedTier, useSavedProjects } from "@/lib/dev/provisional/savedProjectsStore";
import { useMaterialRules } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import type { SavedProjectRecord, SavedQuoteVersion } from "@/lib/dev/provisional/savedProjectsTypes";
import { PROVISIONAL_TIERS, type ProvisionalTier } from "@/lib/dev/provisional/quotationBreakdownTypes";
import type { MaterialRuleEntry } from "@/lib/dev/provisional/companyRulesTypes";
import { useClients } from "@/hooks/useClients";


// 
const TIER_META: Record<ProvisionalTier, { accent: string; headerBg: string; accentBg: string }> = {
  Practical: {
    accent: "text-primary",
    headerBg: "project-tier-gradient bg-linear-to-r from-primary via-orange-400 to-primary",
    accentBg: "bg-orange-50",
  },
  Premium: {
    accent: "text-[#0000CD]",
    headerBg: "project-tier-gradient bg-linear-to-r from-[#0000CD] via-[#4169E1] to-[#0000CD]",
    accentBg: "bg-[#0000CD]/5",
  },
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTimeWithTime(iso: string | null | undefined) {
  const d = new Date(iso ?? "");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function versionLabel(v: SavedQuoteVersion): string {
  const iso = v.price_reference_date;
  return iso ? formatDateTime(iso) : (v.version_number === 1 ? "Original" : `Version ${v.version_number}`);
}

function clientInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "CL";
}

function warrantyLabelFromMaterialRules(project: SavedProjectRecord, materialRules: MaterialRuleEntry[]): string | null {
  const segmentTreatments = new Set(
    project.segmentsSnapshot
      .map((segment) => segment.treatment_type?.trim().toLowerCase())
      .filter((value): value is string => !!value)
  );
  const warrantyYears = Math.max(
    0,
    ...materialRules
      .filter((rule) => rule.is_active && !!rule.treatment_type && segmentTreatments.has(rule.treatment_type.trim().toLowerCase()))
      .map((rule) => rule.warranty_years ?? 0)
  );
  return warrantyYears > 0 ? `${warrantyYears}-year warranty` : null;
}

function lifespanLabel(result: { lifespan_label?: string; material_grade_label: string }): string {
  if (result.lifespan_label) return result.lifespan_label;
  const [, legacyLifespan] = result.material_grade_label.split(" · ");
  return legacyLifespan ?? "Not set";
}

function materialGradeLabel(label: string): string {
  return label.split(" · ")[0] ?? label;
}

function isAcceptedProjectTier(project: SavedProjectRecord, tier: ProvisionalTier): boolean {
  return project.accepted_tier === tier || project.quotes[tier]?.is_selected === true;
}

function QuoteSummaryCard({
  project,
  tier,
  warrantyLabel,
  onViewBreakdown,
  onToggleAccepted,
}: {
  project: SavedProjectRecord;
  tier: ProvisionalTier;
  warrantyLabel: string | null;
  onViewBreakdown: (versionId: string) => void;
  onToggleAccepted: () => void;
}) {
  const meta = TIER_META[tier];
  const snapshot = project.quotes[tier];
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
  if (!snapshot) return null;
  const accepted = isAcceptedProjectTier(project, tier);
  const canChooseAcceptedTier = project.status !== "Final";
  const versions = snapshot.versions;
  const latest = versions[versions.length - 1];
  const displayed = versions.find((v) => v.version_id === viewingVersionId) ?? latest;
  const { result } = displayed;
  const isOriginal = displayed.version_number === 1;
  const displayedVersionLabel = isOriginal && project.status === "Draft" ? "Draft estimate" : versionLabel(displayed);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className={`${meta.headerBg} px-5 py-4 text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest opacity-80">Quote Option</span>
            <h2 className="text-xl font-bold leading-tight">{tier}</h2>
          </div>
          <div className="flex flex-col items-end gap-1">
            {tier === "Premium" ? <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" /> : <TrendingDown className="h-4 w-4 text-white/80" />}
          </div>
        </div>
        <div className="mt-3 border-t border-white/20 pt-3">
          <p className="text-[10px] uppercase tracking-widest opacity-70">
            Total (incl. VAT): {isOriginal ? (project.status === "Final" ? formatDateTime(snapshot.finalized_at ?? displayed.price_reference_date) : "Draft estimate") : displayedVersionLabel}
          </p>
          <p className="text-2xl font-extrabold">{fmtPeso(result.grand_total)}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { icon: Clock, label: "Timeline", val: result.timeline_label },
            { icon: Shield, label: "Warranty", val: warrantyLabel ?? result.warranty_label },
            { icon: Award, label: "Material Grade", val: materialGradeLabel(result.material_grade_label) },
            { icon: Clock, label: "Lifespan", val: lifespanLabel(result) },
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
            Viewing prices as of <strong>{formatDateTime(displayed.price_reference_date)}</strong>
          </p>
          {versions.length > 1 && (
            <select
              value={displayed.version_id}
              onChange={(e) => setViewingVersionId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {versions.map((v) => (
                <option key={v.version_id} value={v.version_id}>
                  {formatDateTimeWithTime(v.price_reference_date)} — {fmtPeso(v.result.grand_total)}
                </option>
              ))}
            </select>
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
  const { clients, isLoading: clientsLoading, error: clientsError } = useClients();
  const { rules: materialRules } = useMaterialRules();
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
    const alreadyAccepted = project.quotes[tier]?.is_selected === true || project.accepted_tier === tier;
    setAcceptedTier(project.project_id, alreadyAccepted ? null : tier);
  };
  const quoteEntries = PROVISIONAL_TIERS
    .map((tier) => [tier, project.quotes[tier]] as const)
    .filter((entry): entry is readonly [ProvisionalTier, NonNullable<SavedProjectRecord["quotes"][ProvisionalTier]>] => {
      const [tier, quote] = entry;
      if (!quote) return false;
      return project.status !== "Final" || isAcceptedProjectTier(project, tier);
    });
  const client = clients.find((entry) => entry.client_id === project.client_id) ?? null;
  const warrantyLabel = warrantyLabelFromMaterialRules(project, materialRules);

  const handleRefresh = () => {
    refreshQuotePrices(project.project_id, "Practical");
    refreshQuotePrices(project.project_id, "Premium");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/projects")}
          title="Back to Open Projects"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleRefresh}
          title="Refresh Practical and Premium prices"
          aria-label="Refresh Practical and Premium prices"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <section className="flex h-full flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="client-details-heading">
        {clientsLoading ? (
          <p className="py-4 text-center text-sm text-gray-400">Loading client details...</p>
        ) : clientsError ? (
          <div className="py-4 text-center">
            <p className="text-sm font-semibold text-red-500">Couldn&apos;t load client details</p>
            <p className="mt-1 text-xs text-gray-400">{clientsError.message}</p>
          </div>
        ) : !client ? (
          <div className="py-4 text-center">
            <p id="client-details-heading" className="text-sm font-semibold text-gray-700">{project.client_name}</p>
            <p className="mt-1 text-xs text-gray-400">The full client record is unavailable.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-sm font-bold text-primary">
                  {clientInitials(client.client_name)}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Client Details</p>
                  <h2 id="client-details-heading" className="truncate text-lg font-semibold text-gray-900">{client.client_name}</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${client.status === "Active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {client.status}
                </span>
              </div>
            </div>

            <div className="grid gap-x-6 gap-y-5 py-4 sm:grid-cols-2">
              {[
                { icon: UserRound, label: "Contact Person", value: client.contact_person || "Not provided" },
                { icon: Mail, label: "Email", value: client.contact_email || "Not provided" },
                { icon: Phone, label: "Phone", value: client.contact_number || "Not provided" },
                { icon: MapPin, label: "Address", value: client.client_address || "Not provided" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex min-w-0 items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
                    <p className="mt-0.5 break-words text-sm font-medium text-gray-700">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
              {[
                ["Project Name", project.project_name],
                ["Project Location", project.project_location],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-700">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Project Status", project.status],
                ["Region", project.project_region],
                ["Created", formatDateTime(project.created_at)],
                ["Last Updated", formatDateTime(project.updated_at)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-700">{value}</p>
                </div>
              ))}
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Notes</p>
                <p className="mt-0.5 text-sm text-gray-700">{client.notes || "-"}</p>
              </div>
            </div>
          </>
        )}
        </section>

        <div className="grid h-full gap-5">
          {quoteEntries.map(([tier]) => (
            <QuoteSummaryCard
              key={tier}
              project={project}
              tier={tier}
              warrantyLabel={warrantyLabel}
              onViewBreakdown={(versionId) => setBreakdown({ tier, versionId })}
              onToggleAccepted={() => handleToggleAccepted(tier)}
            />
          ))}
        </div>
      </div>

      {breakdown &&
        (() => {

          // 
          const snapshot = project.quotes[breakdown.tier];
          if (!snapshot) return null;
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
