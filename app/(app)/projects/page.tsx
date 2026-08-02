"use client";

// Part C — "each row = a project," grouping the two saved tier snapshots (Economic/
// Premium) that came out of one Finalize (see lib/dev/provisional/savedProjectsStore.ts).
// The real /api/quotations endpoint returns flat, per-tier quotation rows with no
// quote_group_id/tier concept to group them by (that's exactly what's provisional —
// part2_schema_addendum.sql) — so this page reads the mock project store instead of that
// real endpoint until backend applies it. Nothing about /api/quotations itself changes.
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search } from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { DataTable } from "@/components/data-table/DataTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";
import { useSavedProjects } from "@/lib/dev/provisional/savedProjectsStore";
import type { SavedProjectRecord } from "@/lib/dev/provisional/savedProjectsTypes";
import { MyClientsTab } from "@/features/clients/components/MyClientsTab";

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: SavedProjectRecord["status"] }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${status === "Final" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

// The tier the CONTRACTOR marked accepted once the client chose (Part C's toggle, set from
// the project detail page) — reads is_selected off whichever snapshot has it true. Neither
// tier is selected immediately after Finalize (Part B); this shows that honestly too.
function AcceptedBadge({ project }: { project: SavedProjectRecord }) {
  if (project.quotes.Economic.is_selected) {
    return <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-primary">Economic accepted</span>;
  }
  if (project.quotes.Premium.is_selected) {
    return <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-600">Premium accepted</span>;
  }
  return <span className="text-xs text-gray-400">Not yet chosen</span>;
}

function OpenProjectsContent() {
  const router = useRouter();
  const projects = useSavedProjects();
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.project_name.toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q) || p.project_location.toLowerCase().includes(q));
  }, [projects, search]);

  const columns = useMemo<ColumnDef<SavedProjectRecord>[]>(
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
        cell: ({ row }) => <AcceptedBadge project={row.original} />,
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
            href={`/projects/${row.original.project_id}`}
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
          {filteredRows.length} of {projects.length} saved project{projects.length !== 1 ? "s" : ""}
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
        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <p className="text-sm font-semibold text-gray-500">No saved projects yet</p>
            <p className="text-xs text-gray-400">Projects appear automatically once a quotation is generated and finalized.</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredRows}
            globalFilter={search}
            initialSorting={[{ id: "created_at", desc: true }]}
            onRowClick={(row) => router.push(`/projects/${row.project_id}`)}
          />
        )}
      </div>
    </div>
  );
}

// PART B (Task 6) — Open Projects restructured into two tabs: the existing quote/project
// list (unchanged, now tab 1) and the new My Clients tab (tab 2). Project detail navigation
// and the read-only breakdown reuse are untouched by this split.
function OpenProjectsTabs() {
  return (
    <Tabs defaultValue="projects" className="flex flex-col gap-5">
      <TabsList className="w-fit">
        <TabsTrigger value="projects">Quotations / Projects</TabsTrigger>
        <TabsTrigger value="clients">My Clients</TabsTrigger>
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