"use client";

import { useRouter } from "next/navigation";

export interface ClientQuotationCardData {
  quote_id: number;
  project_name: string;
  project_region: string;
  status: string;
  accepted_tier: "Practical" | "Premium" | null;
  grand_total: number;
  created_at: string;
  updated_at?: string;
  updated_by_user_name?: string | null;
  updated_by_user_email?: string | null;
  made_by_user_id?: number;
  made_by_user_name?: string | null;
  made_by_user_email?: string | null;
}

function formatDate(value: string | undefined) {
  const date = new Date(value ?? "");
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function formatPeso(value: number, status: string) {
  if (status === "Draft" && value === 0) return "₱-";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CL";
}

export function QuotationCard({ project, clientName, selectionInset = false }: { project: ClientQuotationCardData; clientName: string; selectionInset?: boolean }) {
  const router = useRouter();
  const isPremium = project.status === "Final" && project.accepted_tier === "Premium";
  const isPractical = project.status === "Final" && project.accepted_tier === "Practical";
  const hasTierColor = isPremium || isPractical;
  const updatedBy = project.updated_by_user_name || project.updated_by_user_email || "Not available";
  const madeBy = project.made_by_user_name || (project.made_by_user_id ? `User ${project.made_by_user_id}` : "Not available");

  const openQuotation = () => {
    router.push(project.status === "Draft" ? `/quotations/new?resumeQuoteId=${project.quote_id}` : `/quotations/${project.quote_id}`);
  };

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={openQuotation}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openQuotation();
        }
      }}
      className={`group cursor-pointer overflow-hidden rounded-2xl bg-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg ${
        hasTierColor ? "" : "border border-gray-100 hover:border-gray-200"
      }`}
    >
      <div
        className={`flex items-start justify-between gap-4 p-5 ${
          isPremium
            ? "project-tier-gradient bg-linear-to-r from-[#0000CD] via-[#4169E1] to-[#0000CD]"
            : isPractical
              ? "project-tier-gradient bg-linear-to-r from-primary via-orange-400 to-primary"
              : "bg-white"
        }`}
      >
        <div className={`min-w-0 ${selectionInset ? "pl-8" : ""}`}>
          <h2 className={`truncate text-base font-semibold ${hasTierColor ? "text-white" : "text-gray-900 group-hover:text-primary"}`}>
            {project.project_name}
          </h2>
          <div className="mt-3 flex items-center gap-2.5">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${hasTierColor ? "bg-white/20 text-white" : "bg-orange-50 text-primary"}`}>
              {initials(clientName)}
            </div>
            <div className="min-w-0">
              <p className={`text-[10px] font-semibold uppercase tracking-wider ${hasTierColor ? "text-white/65" : "text-gray-400"}`}>Client</p>
              <p className={`truncate text-sm font-medium ${hasTierColor ? "text-white" : "text-gray-700"}`}>{clientName}</p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${hasTierColor ? "bg-white/20 text-white" : project.status === "Final" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
            {project.status}
          </span>
          {project.accepted_tier && project.status === "Final" && (
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${hasTierColor ? "border border-white/30 bg-white/10 text-white" : "bg-gray-100 text-gray-600"}`}>
              {project.accepted_tier}
            </span>
          )}
        </div>
      </div>

      <div className="mx-5 grid grid-cols-2 gap-3 border-t border-gray-100 py-4 sm:grid-cols-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Region</p>
          <p className="mt-1 truncate text-xs font-medium text-gray-600">{project.project_region}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total</p>
          <p className="mt-1 truncate text-xs font-medium text-gray-600">{formatPeso(project.grand_total, project.status)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Updated By</p>
          <p className="mt-1 truncate text-xs font-medium text-gray-600" title={project.updated_by_user_email ?? undefined}>
            {updatedBy}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-gray-400">{formatDate(project.updated_at)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Made By</p>
          <p className="mt-1 truncate text-xs font-medium text-gray-600" title={project.made_by_user_email ?? undefined}>
            {madeBy}
          </p>
        </div>
      </div>
    </article>
  );
}
