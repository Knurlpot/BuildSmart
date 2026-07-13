"use client";

// Assumed endpoint — UNVERIFIED, confirm with the backend team:
//   GET /api/quotations   (company-scoped, per session)
//
// Hide is a CLIENT-SIDE, SESSION-ONLY display filter (eye icon) — schema v3 explicitly
// documents there is no is_archived column and none should be added. Plain component
// state satisfies "session-only" on its own (it's gone on reload already), so there's
// nothing to persist and no endpoint call here.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, EyeOff, Plus, Search } from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { QueryState } from "@/components/feedback/QueryState";
import { DataTable } from "@/components/data-table/DataTable";
import { useFetch } from "@/hooks/useFetch";
import type { Quotation } from "@/types/entities";

const STATUS_FILTERS: ("All" | Quotation["status"])[] = ["All", "Draft", "Final"];

function fmt(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: Quotation["status"] }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        status === "Final" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

function OpenProjectsContent() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useFetch<Quotation[]>("/api/quotations");
  const rows = useMemo(() => data ?? [], [data]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | Quotation["status"]>("All");
  const [showHidden, setShowHidden] = useState(false);

  // Session-only, client-side hide — never sent to the backend, gone on reload.
  // Not localStorage/sessionStorage either: "session" here means "this page visit."
  const [hiddenIds, setHiddenIds] = useState<Set<Quotation["quote_id"]>>(new Set());
  const toggleHidden = (id: Quotation["quote_id"]) =>
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (!showHidden && hiddenIds.has(r.quote_id)) return false;
        if (statusFilter !== "All" && r.status !== statusFilter) return false;
        return true;
      }),
    [rows, statusFilter, showHidden, hiddenIds]
  );

  const columns = useMemo<ColumnDef<Quotation>[]>(
    () => [
      { accessorKey: "project_name", header: "Project Name" },
      { accessorKey: "project_location", header: "Location" },
      { accessorKey: "project_region", header: "Region", enableGlobalFilter: false },
      {
        accessorKey: "status",
        header: "Status",
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={row.original.status} />
            {hiddenIds.has(row.original.quote_id) && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                Hidden
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "grand_total",
        header: "Grand Total",
        enableGlobalFilter: false,
        cell: ({ getValue }) => (
          <span className="font-semibold text-gray-900">{fmt(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Created",
        enableGlobalFilter: false,
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-400">{formatDate(getValue<string>())}</span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const id = row.original.quote_id;
          const hidden = hiddenIds.has(id);
          return (
            <div className="flex items-center gap-2">
              <Link
                href={`/projects/${id}`}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-primary hover:text-primary"
              >
                Open
              </Link>
              <button
                type="button"
                onClick={() => toggleHidden(id)}
                title={hidden ? "Unhide this project" : "Hide this project (this view only)"}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-400 transition hover:border-gray-300 hover:text-gray-600"
              >
                {hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {hidden ? "Unhide" : "Hide"}
              </button>
            </div>
          );
        },
      },
    ],
    [hiddenIds]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {filteredRows.length} of {rows.length} saved quotation{rows.length !== 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={() => router.push("/quotations/new")}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
        >
          <Plus className="h-4 w-4" /> Create New
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by project name or location…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "All" | Quotation["status"])}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-primary"
          />
          Show hidden
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={rows.length === 0}
          onRetry={refetch}
          emptyTitle="No saved quotations yet"
          emptyHint="Projects are created automatically once a quotation is generated and saved."
          minHeight={260}
        >
          <DataTable
            columns={columns}
            data={filteredRows}
            globalFilter={search}
            initialSorting={[{ id: "created_at", desc: true }]}
          />
        </QueryState>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <RequireOnboardingStep minStep={2}>
      <OpenProjectsContent />
    </RequireOnboardingStep>
  );
}
