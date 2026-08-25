"use client";

// 
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ellipsis, Eye, FileText, FolderOpen, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { apiClient } from "@/lib/api/client";
import { MyClientsTab } from "@/features/clients/components/MyClientsTab";
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
  grand_total: number;
  created_at: string;
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
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "Final" | "Draft">("All");
  const [deleteTarget, setDeleteTarget] = useState<OpenProjectRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const rows = useMemo<OpenProjectRow[]>(() => {
    return (quotations ?? []).map((quote) => {
      const clientName = quote.client_name ?? "No client";

      return {
        id: `quote-${quote.quote_id}`,
        quote_id: quote.quote_id,
        client_name: clientName,
        project_name: quote.project_name,
        project_location: quote.project_location,
        project_region: quote.project_region,
        status: quote.status,
        grand_total: quote.grand_total,
        created_at: quote.created_at,
      };
    });
  }, [quotations]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((p) => {
        const matchesRegion = region === "All" || p.project_region === region;
        const matchesStatus = statusFilter === "All" || p.status === statusFilter;
        const matchesSearch = !q || p.project_name.toLowerCase().includes(q);
        return matchesRegion && matchesStatus && matchesSearch;
      })
      .sort((a, b) => Number(b.status === "Final") - Number(a.status === "Final"));
  }, [region, rows, search, statusFilter]);

  const openRow = (row: OpenProjectRow) => {
    router.push(row.status === "Draft" ? `/quotations/new?resumeQuoteId=${row.quote_id}` : `/quotations/${row.quote_id}`);
  };
  const createNew = useCallback(() => router.push("/quotations/new"), [router]);

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

  useEffect(() => {
    onMetaChange({ filteredCount: filteredRows.length, totalCount: rows.length, onCreateNew: createNew });
  }, [createNew, filteredRows.length, onMetaChange, rows.length]);

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
          <div className="flex h-10 items-center gap-2">
            {(["Draft", "Final"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter((current) => (current === status ? "All" : status))}
                className={`h-9 rounded-full border px-3 text-xs font-bold transition ${
                  statusFilter === status
                    ? "border-primary bg-orange-50 text-primary"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
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
            const href = project.status === "Draft" ? `/quotations/new?resumeQuoteId=${project.quote_id}` : `/quotations/${project.quote_id}`;
            return (
              <article
                key={project.id}
                role="link"
                tabIndex={0}
                onClick={() => openRow(project)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") openRow(project);
                }}
                className="group cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md transition-all hover:border-gray-200"
              >
                <div className="flex items-start justify-between gap-4 bg-white p-5">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-gray-900 transition-colors group-hover:text-primary">
                      {project.project_name}
                    </h2>
                    <div className="mt-3 flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-xs font-semibold text-primary">
                        {clientInitials(project.client_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Client</p>
                        <p className="truncate text-sm font-medium text-gray-700">{project.client_name}</p>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={project.status} />
                </div>

                <div className="mx-5 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Region</p>
                    <p className="mt-1 truncate text-xs font-medium text-gray-600">{project.project_region}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total</p>
                    <p className="mt-1 truncate text-xs font-medium text-gray-600">{formatPeso(project.grand_total)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Created</p>
                    <p className="mt-1 truncate text-xs font-medium text-gray-600">{formatDate(project.created_at)}</p>
                  </div>
                </div>

                <div className="mx-5 mb-5 mt-4 flex items-center justify-end gap-2">
                  <Link
                    href={href}
                    onClick={(event) => event.stopPropagation()}
                    title="View"
                    aria-label={`View ${project.project_name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteError(null);
                      setDeleteTarget(project);
                    }}
                    title="Delete"
                    aria-label={`Delete ${project.project_name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-500 transition hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
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
    </div>
  );
}

// 
function OpenProjectsTabs() {
  const [activeTab, setActiveTab] = useState("projects");
  const [projectsMeta, setProjectsMeta] = useState<{
    filteredCount: number;
    totalCount: number;
    onCreateNew: () => void;
  } | null>(null);
  const [clientCount, setClientCount] = useState(0);
  const [showClientImport, setShowClientImport] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [clientImportFiles, setClientImportFiles] = useState<File[]>([]);
  const [clientImportKey, setClientImportKey] = useState(0);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const clientImportInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [actionsMenuOpen]);

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
          <input
            ref={clientImportInputRef}
            type="file"
            multiple
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(event) => {
              const files = event.target.files ? Array.from(event.target.files) : [];
              if (files.length > 0) {
                setClientImportFiles(files);
                setClientImportKey((key) => key + 1);
                setShowClientImport(true);
              }
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={projectsMeta?.onCreateNew}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
          >
            <Plus className="h-4 w-4" /> Create New
          </button>
          {activeTab === "clients" && (
            <div ref={actionsMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setActionsMenuOpen((open) => !open)}
                aria-label="Client actions"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-gray-300 hover:text-gray-700"
              >
                <Ellipsis className="h-5 w-5" />
              </button>
              {actionsMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      clientImportInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-primary"
                  >
                    <Upload className="h-4 w-4" />
                    Import Client
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
        <MyClientsTab onClientCountChange={setClientCount} showImport={showClientImport} importFiles={clientImportFiles} importKey={clientImportKey} />
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
