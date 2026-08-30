"use client";

// 
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, EllipsisVertical, FileText, FolderOpen, ListFilter, Plus, Search, Trash2, Upload, Users, X } from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter, useSearchParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { apiClient } from "@/lib/api/client";
import { MyClientsTab } from "@/features/clients/components/MyClientsTab";
import { useSavedProjects } from "@/lib/dev/provisional/savedProjectsStore";
import type { Quotation } from "@/types/entities";
import { PH_REGIONS } from "@/types/entities/common";

interface ProjectListQuotation extends Quotation {
  client_name: string | null;
}

interface OpenProjectRow {
  id: string;
  quote_id: number;
  client_name: string;
  project_name: string;
  project_location: string;
  project_region: string;
  status: Quotation["status"];
  accepted_tier: Quotation["accepted_tier"];
  grand_total: number;
  created_at: string;
  saved_project_id: string | null;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status, onTierColor = false }: { status: OpenProjectRow["status"]; onTierColor?: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${onTierColor ? "bg-white/20 text-white" : status === "Final" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);
}

function formatProjectTotal(project: OpenProjectRow) {
  if (project.status === "Draft" && project.grand_total === 0) return "₱-";
  return formatPeso(project.grand_total);
}

function clientInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials || "NC";
}

interface OpenProjectsContentProps {
  onMetaChange: (meta: { filteredCount: number; totalCount: number; onCreateNew: () => void }) => void;
}

function OpenProjectsContent({ onMetaChange }: OpenProjectsContentProps) {
  const router = useRouter();
  const { data: quotations, isLoading, error, refetch } = useFetch<ProjectListQuotation[]>("/api/quotations");
  const savedProjects = useSavedProjects();
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "Final" | "Draft">("All");
  const [tierFilter, setTierFilter] = useState<"All" | "Practical" | "Premium">("All");
  const [draftStatusFilter, setDraftStatusFilter] = useState<"All" | "Final" | "Draft">("All");
  const [draftTierFilter, setDraftTierFilter] = useState<"All" | "Practical" | "Premium">("All");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [projectActionsOpen, setProjectActionsOpen] = useState(false);
  const [projectSelectMode, setProjectSelectMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OpenProjectRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const rows = useMemo<OpenProjectRow[]>(() => {
    return (quotations ?? []).map((quote) => {
      const clientName = quote.client_name ?? "No client";
      const savedProject = savedProjects.find((project) => project.source_quote_id === quote.quote_id)
        ?? savedProjects.find((project) =>
          project.project_name === quote.project_name &&
          project.client_id === quote.client_id &&
          project.project_location === quote.project_location &&
          project.project_region === quote.project_region
        )

      return {
        id: `quote-${quote.quote_id}`,
        quote_id: quote.quote_id,
        client_name: clientName,
        project_name: quote.project_name,
        project_location: quote.project_location,
        project_region: quote.project_region,
        status: quote.status,
        accepted_tier: quote.accepted_tier ?? null,
        grand_total: quote.grand_total,
        created_at: quote.created_at,
        saved_project_id: savedProject?.project_id ?? null,
      };
    });
  }, [quotations, savedProjects]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((p) => {
        const matchesRegion = region === "All" || p.project_region === region;
        const matchesStatus = statusFilter === "All" || p.status === statusFilter;
        const matchesTier = tierFilter === "All" || p.accepted_tier === tierFilter;
        const matchesSearch = !q || p.project_name.toLowerCase().includes(q);
        return matchesRegion && matchesStatus && matchesTier && matchesSearch;
      })
      .sort((a, b) => Number(b.status === "Final") - Number(a.status === "Final"));
  }, [region, rows, search, statusFilter, tierFilter]);

  const openRow = (row: OpenProjectRow) => {
    router.push(row.status === "Draft" ? `/quotations/new?resumeQuoteId=${row.quote_id}` : row.saved_project_id ? `/projects/${row.saved_project_id}` : `/quotations/${row.quote_id}`);
  };
  const createNew = useCallback(() => router.push("/quotations/new"), [router]);
  const selectedProjects = useMemo(() => filteredRows.filter((project) => selectedProjectIds.has(project.id)), [filteredRows, selectedProjectIds]);
  const selectedProjectCount = selectedProjects.length;

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const stopProjectSelection = () => {
    setProjectSelectMode(false);
    setSelectedProjectIds(new Set());
  };

  const deleteProject = useCallback(async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiClient<void>(`/api/quotations/${deleteTarget.quote_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setDeleteTarget(null);
      refetch();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete this project.");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, isDeleting, refetch]);

  const deleteSelectedProjects = useCallback(async () => {
    if (selectedProjects.length === 0 || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await Promise.all(
        selectedProjects.map((project) =>
          apiClient<void>(`/api/quotations/${project.quote_id}`, {
            method: "DELETE",
            credentials: "include",
          })
        )
      );
      setBatchDeleteOpen(false);
      stopProjectSelection();
      refetch();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete selected projects.");
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, refetch, selectedProjects]);

  useEffect(() => {
    onMetaChange({ filteredCount: filteredRows.length, totalCount: rows.length, onCreateNew: createNew });
  }, [createNew, filteredRows.length, onMetaChange, rows.length]);

  useEffect(() => {
    if (!filterOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterOpen]);

  const activeFilterCount = Number(statusFilter !== "All") + Number(tierFilter !== "All");
  const openFilters = () => {
    setDraftStatusFilter(statusFilter);
    setDraftTierFilter(tierFilter);
    setFilterOpen(true);
  };
  const applyFilters = () => {
    setStatusFilter(draftStatusFilter);
    setTierFilter(draftTierFilter);
    setFilterOpen(false);
  };
  const clearFilters = () => {
    setStatusFilter("All");
    setTierFilter("All");
    setDraftStatusFilter("All");
    setDraftTierFilter("All");
    setFilterOpen(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div className="relative min-w-50 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project name…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="h-10 w-44 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-600 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
          >
            <option value="All">All regions</option>
            {PH_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <div ref={filterRef} className="relative">
            <button
              type="button"
              onClick={() => {
                if (filterOpen) {
                  setFilterOpen(false);
                  return;
                }
                openFilters();
              }}
              aria-label="Project filters"
              title="Project filters"
              className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-bold transition ${
                activeFilterCount > 0
                  ? "border-primary bg-orange-50 text-primary"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              <ListFilter className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">{activeFilterCount}</span>
              )}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Project Filters</p>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-50 hover:text-gray-600"
                    aria-label="Close filters"
                    title="Close filters"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex flex-col gap-3">
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Project Status</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(["Draft", "Final"] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setDraftStatusFilter(status)}
                          className={`h-9 rounded-lg border px-2 text-xs font-bold transition ${
                            draftStatusFilter === status
                              ? "border-primary bg-orange-50 text-primary"
                              : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Practical or Premium</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(["All", "Practical", "Premium"] as const).map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setDraftTierFilter(tier)}
                          className={`h-9 rounded-lg border px-2 text-xs font-bold transition ${
                            draftTierFilter === tier
                              ? "border-primary bg-orange-50 text-primary"
                              : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={applyFilters}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
          {projectSelectMode ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">{selectedProjectCount} selected</span>
              <button
                type="button"
                onClick={() => setBatchDeleteOpen(true)}
                disabled={selectedProjectCount === 0}
                aria-label="Delete selected projects"
                title="Delete selected projects"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={stopProjectSelection}
                aria-label="Cancel project selection"
                title="Cancel project selection"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setProjectActionsOpen((open) => !open)}
                aria-label="Project actions"
                title="Project actions"
                aria-expanded={projectActionsOpen}
                aria-haspopup="menu"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-primary hover:text-primary"
              >
                <EllipsisVertical className="h-5 w-5" />
              </button>
              {projectActionsOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-36 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setProjectActionsOpen(false);
                      setProjectSelectMode(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    <Check className="h-4 w-4" /> Select
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center text-sm text-gray-400 shadow-sm">
          Loading projects...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-red-500">Couldn&apos;t load projects</p>
          <button type="button" onClick={refetch} className="mt-2 text-sm font-medium text-primary hover:underline">
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-primary">
            <FolderOpen className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium text-gray-900">Start your first project</p>
          <p className="mt-1 text-sm text-gray-500">Create a quotation to begin tracking project estimates here.</p>
          <button
            type="button"
            onClick={createNew}
            className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
          >
            <Plus className="h-4 w-4" /> Create New
          </button>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
          <p className="font-medium text-gray-900">No matching projects</p>
          <p className="mt-1 text-sm text-gray-500">Try a different project name or region.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredRows.map((project) => {
            const tier = project.accepted_tier;
            const isPremiumFinal = project.status === "Final" && tier === "Premium";
            const isPracticalFinal = project.status === "Final" && tier === "Practical";
            const hasTierColor = isPremiumFinal || isPracticalFinal;
            const selected = selectedProjectIds.has(project.id);
            return (
              <article
                key={project.id}
                role="link"
                tabIndex={0}
                onClick={() => {
                  if (projectSelectMode) {
                    toggleProjectSelection(project.id);
                    return;
                  }
                  openRow(project);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    if (projectSelectMode) {
                      event.preventDefault();
                      toggleProjectSelection(project.id);
                      return;
                    }
                    openRow(project);
                  }
                }}
                className={`group cursor-pointer overflow-hidden rounded-2xl bg-white shadow-md transition-all ${
                  selected ? "ring-2 ring-primary/30" : ""
                } ${hasTierColor ? "" : "border border-gray-100 hover:border-gray-200"}`}
              >
                <div className={`flex items-start justify-between gap-4 p-5 ${isPremiumFinal ? "project-tier-gradient bg-linear-to-r from-[#0000CD] via-[#4169E1] to-[#0000CD]" : isPracticalFinal ? "project-tier-gradient bg-linear-to-r from-primary via-orange-400 to-primary" : "bg-white"}`}>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          !projectSelectMode
                            ? "invisible border-transparent text-transparent"
                            : selected
                              ? "border-white bg-white text-primary"
                              : hasTierColor
                                ? "border-white/50 bg-white/10 text-transparent"
                                : "border-gray-300 bg-white text-transparent"
                        }`}
                        aria-hidden="true"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <h2 className={`truncate text-base font-semibold transition-colors ${hasTierColor ? "text-white" : "text-gray-900 group-hover:text-primary"}`}>
                        {project.project_name}
                      </h2>
                    </div>
                    <div className="mt-3 flex items-center gap-2.5">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${hasTierColor ? "bg-white/20 text-white" : "bg-orange-50 text-primary"}`}>
                        {clientInitials(project.client_name)}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[10px] font-semibold uppercase tracking-wider ${hasTierColor ? "text-white/65" : "text-gray-400"}`}>Client</p>
                        <p className={`truncate text-sm font-medium ${hasTierColor ? "text-white" : "text-gray-700"}`}>{project.client_name}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={project.status} onTierColor={hasTierColor} />
                    {tier && project.status === "Final" && (
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${hasTierColor ? "border border-white/30 bg-white/10 text-white" : "bg-gray-100 text-gray-600"}`}>
                        {tier}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mx-5 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Region</p>
                    <p className="mt-1 truncate text-xs font-medium text-gray-600">{project.project_region}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total</p>
                    <p className="mt-1 truncate text-xs font-medium text-gray-600">{formatProjectTotal(project)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Created</p>
                    <p className="mt-1 truncate text-xs font-medium text-gray-600">{formatDate(project.created_at)}</p>
                  </div>
                </div>

                <div className="mx-5 mb-5 mt-4 h-8" aria-hidden="true" />
              </article>
            );
          })}
        </div>
      )}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `Delete ${deleteTarget.project_name} and its quotation data? This cannot be undone.` : "This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}
          <DialogFooter>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={deleteProject}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Delete project"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={batchDeleteOpen} onOpenChange={(open) => !open && !isDeleting && setBatchDeleteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected projects?</DialogTitle>
            <DialogDescription>
              Delete {selectedProjectCount} selected project{selectedProjectCount === 1 ? "" : "s"} and their quotation data? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}
          <DialogFooter>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setBatchDeleteOpen(false)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting || selectedProjectCount === 0}
              onClick={deleteSelectedProjects}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : `Delete ${selectedProjectCount}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 
function OpenProjectsTabs() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") === "clients" ? "clients" : "projects";
  const [activeTab, setActiveTab] = useState(requestedTab);
  const [projectsMeta, setProjectsMeta] = useState<{
    filteredCount: number;
    totalCount: number;
    onCreateNew: () => void;
  } | null>(null);
  const [clientCount, setClientCount] = useState(0);
  const [showClientImport, setShowClientImport] = useState(false);
  const [clientActionsOpen, setClientActionsOpen] = useState(false);
  const [clientImportFiles, setClientImportFiles] = useState<File[]>([]);
  const [clientImportKey, setClientImportKey] = useState(0);

  const toggleClientImport = () => {
    if (!showClientImport) {
      setClientImportFiles([]);
      setClientImportKey((key) => key + 1);
    }
    setShowClientImport((visible) => !visible);
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList className="flex h-auto w-fit gap-2 bg-transparent p-0">
            <TabsTrigger
              value="projects"
              className="flex h-10 min-w-40 flex-none items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 data-active:border-primary data-active:bg-primary data-active:text-primary-foreground"
            >
              <FileText className="h-4 w-4" /> Quotations
            </TabsTrigger>
            <TabsTrigger
              value="clients"
              className="flex h-10 min-w-36 flex-none items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 data-active:border-primary data-active:bg-primary data-active:text-primary-foreground"
            >
              <Users className="h-4 w-4" /> My Clients
            </TabsTrigger>
          </TabsList>
          {activeTab === "projects" && projectsMeta && (
            <p className="text-sm text-gray-500">
              {projectsMeta.filteredCount} of {projectsMeta.totalCount} project{projectsMeta.totalCount !== 1 ? "s" : ""}
            </p>
          )}
          {activeTab === "clients" && (
            <p className="text-sm text-gray-500">
              {clientCount} client{clientCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={projectsMeta?.onCreateNew}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
          >
            <Plus className="h-4 w-4" /> Create New
          </button>
          {activeTab === "clients" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setClientActionsOpen((open) => !open)}
                aria-label="Client actions"
                title="Client actions"
                aria-expanded={clientActionsOpen}
                aria-haspopup="menu"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-primary hover:text-primary"
              >
                <EllipsisVertical className="h-5 w-5" />
              </button>
              {clientActionsOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setClientActionsOpen(false);
                      toggleClientImport();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    <Upload className="h-4 w-4" /> Import Clients
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <TabsContent value="projects">
        <OpenProjectsContent onMetaChange={setProjectsMeta} />
      </TabsContent>
      <TabsContent value="clients">
        <MyClientsTab
          onClientCountChange={setClientCount}
          showImport={showClientImport}
          importFiles={clientImportFiles}
          importKey={clientImportKey}
        />
      </TabsContent>
    </Tabs>
  );
}

export default function ProjectsPage() {
  return (
    <RequireOnboardingStep minStep={2}>
      <OpenProjectsTabs />
    </RequireOnboardingStep>
  );
}
