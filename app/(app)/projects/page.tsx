"use client";

// 
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Ellipsis, Eye, Plus, Search, Trash2, Upload } from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { DataTable } from "@/components/data-table/DataTable";
import { QueryState } from "@/components/feedback/QueryState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { deleteSavedProject, useSavedProjects } from "@/lib/dev/provisional/savedProjectsStore";
import { apiClient } from "@/lib/api/client";
import type { SavedProjectRecord } from "@/lib/dev/provisional/savedProjectsTypes";
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
  created_at: string;
  savedProject: SavedProjectRecord | null;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: OpenProjectRow["status"] }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${status === "Final" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

// 
function AcceptedBadge({ project }: { project: SavedProjectRecord | null }) {
  if (!project) return <span className="text-xs text-gray-400">Not yet chosen</span>;
  if (project.quotes.Practical.is_selected) {
    return <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-primary">Practical accepted</span>;
  }
  if (project.quotes.Premium.is_selected) {
    return <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-600">Premium accepted</span>;
  }
  return <span className="text-xs text-gray-400">Not yet chosen</span>;
}

interface OpenProjectsContentProps {
  onMetaChange: (meta: { filteredCount: number; totalCount: number; onCreateNew: () => void }) => void;
}

function OpenProjectsContent({ onMetaChange }: OpenProjectsContentProps) {
  const router = useRouter();
  const savedProjects = useSavedProjects();
  const { data: quotations, isLoading, error, refetch } = useFetch<ProjectListQuotation[]>("/api/quotations");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("All");
  const [deleteTarget, setDeleteTarget] = useState<OpenProjectRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const rows = useMemo<OpenProjectRow[]>(() => {
    const savedByProject = new Map(
      savedProjects.map((project) => [
        [
          project.client_id,
          project.project_name,
          project.project_location,
          project.project_region,
        ].join("\u0000"),
        project,
      ])
    );

    return (quotations ?? []).map((quote) => {
      const clientName = quote.client_name ?? "No client";
      const savedProject =
        quote.client_id == null
          ? null
          : savedByProject.get(
              [
                quote.client_id,
                quote.project_name,
                quote.project_location,
                quote.project_region,
              ].join("\u0000")
            ) ?? null;

      return {
        id: `quote-${quote.quote_id}`,
        quote_id: quote.quote_id,
        client_name: clientName,
        project_name: quote.project_name,
        project_location: quote.project_location,
        project_region: quote.project_region,
        status: quote.status,
        created_at: quote.created_at,
        savedProject,
      };
    });
  }, [quotations, savedProjects]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      const matchesRegion = region === "All" || p.project_region === region;
      const matchesSearch = !q || p.project_name.toLowerCase().includes(q);
      return matchesRegion && matchesSearch;
    });
  }, [region, rows, search]);

  const openRow = (row: OpenProjectRow) => {
    router.push(row.savedProject ? `/projects/${row.savedProject.project_id}` : `/quotations/${row.quote_id}`);
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
      if (deleteTarget.savedProject) deleteSavedProject(deleteTarget.savedProject.project_id);
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

  const columns = useMemo<ColumnDef<OpenProjectRow>[]>(
    () => [
      { accessorKey: "client_name", header: "Client" },
      { accessorKey: "project_name", header: "Project Name" },
      { accessorKey: "project_region", header: "Region", enableGlobalFilter: false },
      {
        accessorKey: "status",
        header: "Status",
        enableGlobalFilter: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "accepted",
        header: "Accepted Tier",
        enableGlobalFilter: false,
        cell: ({ row }) => <AcceptedBadge project={row.original.savedProject} />,
      },
      {
        accessorKey: "created_at",
        header: "Created",
        enableGlobalFilter: false,
        cell: ({ getValue }) => <span className="text-xs text-gray-400">{formatDate(getValue<string>())}</span>,
      },
      {
        id: "actions",
        header: "",
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Link
              href={row.original.savedProject ? `/projects/${row.original.savedProject.project_id}` : `/quotations/${row.original.quote_id}`}
              onClick={(e) => e.stopPropagation()}
              title="View"
              aria-label={`View ${row.original.project_name}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
            >
              <Eye className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setDeleteError(null);
                setDeleteTarget(row.original);
              }}
              title="Delete"
              aria-label={`Delete ${row.original.project_name}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-500 transition hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 p-4">
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
        </div>
        <QueryState isLoading={isLoading} error={error} isEmpty={rows.length === 0} onRetry={refetch} emptyTitle="No projects yet" minHeight={180}>
          <DataTable
            columns={columns}
            data={filteredRows}
            globalFilter={search}
            initialSorting={[{ id: "created_at", desc: true }]}
            onRowClick={openRow}
          />
        </QueryState>
      </div>
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
          <TabsList className="flex h-12 w-fit gap-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-0">
            <TabsTrigger
              value="projects"
              className="!h-full min-w-52 flex-none rounded-none px-7 py-3 text-sm font-semibold text-gray-500 transition hover:bg-gray-50 data-active:bg-primary data-active:text-primary-foreground"
            >
              Quotations / Projects
            </TabsTrigger>
            <TabsTrigger
              value="clients"
              className="!h-full min-w-44 flex-none rounded-none px-7 py-3 text-sm font-semibold text-gray-500 transition hover:bg-gray-50 data-active:bg-primary data-active:text-primary-foreground"
            >
              My Clients
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
