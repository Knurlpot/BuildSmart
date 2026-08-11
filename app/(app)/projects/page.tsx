"use client";

// 
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search } from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { DataTable } from "@/components/data-table/DataTable";
import { QueryState } from "@/components/feedback/QueryState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { useSavedProjects } from "@/lib/dev/provisional/savedProjectsStore";
import type { SavedProjectRecord } from "@/lib/dev/provisional/savedProjectsTypes";
import { MyClientsTab } from "@/features/clients/components/MyClientsTab";
import type { Quotation } from "@/types/entities";

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

function OpenProjectsContent() {
  const router = useRouter();
  const savedProjects = useSavedProjects();
  const { data: quotations, isLoading, error, refetch } = useFetch<ProjectListQuotation[]>("/api/quotations");
  const [search, setSearch] = useState("");

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
    if (!q) return rows;
    return rows.filter((p) => p.project_name.toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q) || p.project_location.toLowerCase().includes(q));
  }, [rows, search]);

  const openRow = (row: OpenProjectRow) => {
    router.push(row.savedProject ? `/projects/${row.savedProject.project_id}` : `/quotations/${row.quote_id}`);
  };

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
          <Link
            href={row.original.savedProject ? `/projects/${row.original.savedProject.project_id}` : `/quotations/${row.original.quote_id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-primary hover:text-primary"
          >
            Open
          </Link>
        ),
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {filteredRows.length} of {rows.length} project{rows.length !== 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={() => router.push("/quotations/new")}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
        >
          <Plus className="h-4 w-4" /> Create New
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="relative flex-1 min-w-50">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client, project name, or location…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
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
    </div>
  );
}

// 
function OpenProjectsTabs() {
  return (
    <Tabs defaultValue="projects" className="flex flex-col gap-5">
      <TabsList className="flex w-fit gap-1 rounded-lg border border-gray-200 bg-white p-1">
        <TabsTrigger
          value="projects"
          className="h-auto flex-none rounded-md px-5 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-50 data-active:bg-primary data-active:text-primary-foreground"
        >
          Quotations / Projects
        </TabsTrigger>
        <TabsTrigger
          value="clients"
          className="h-auto flex-none rounded-md px-5 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-50 data-active:bg-primary data-active:text-primary-foreground"
        >
          My Clients
        </TabsTrigger>
      </TabsList>
      <TabsContent value="projects">
        <OpenProjectsContent />
      </TabsContent>
      <TabsContent value="clients">
        <MyClientsTab />
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
