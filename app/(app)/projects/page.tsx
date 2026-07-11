"use client";

// Assumed endpoints — UNVERIFIED, confirm with the backend team:
//   GET   /api/quotations         (company-scoped, per session)
//   PATCH /api/quotations/:id     { is_archived: true }   (archive — see STOP note below)
//
// ⚠️ STOP — SCHEMA CHANGE REQUEST, not just an unconfirmed path:
// CLAUDE.md documents quotations.status as ONLY 'Draft' | 'Final' — there is no archived
// state anywhere in the authoritative 13-table SQL. "Archive" here assumes a NEW
// `is_archived` boolean column (added to types/entities/quotation.ts, flagged there as
// PROPOSED). This is a schema-change request the backend team must accept and add to the
// SQL — Archive cannot actually work until that column exists. This is not resolved by
// confirming an endpoint path; it requires a human decision on the schema itself.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Plus, Search } from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { QueryState } from "@/components/feedback/QueryState";
import { DataTable } from "@/components/data-table/DataTable";
import { useFetch } from "@/hooks/useFetch";
import { useMutation } from "@/hooks/useMutation";
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
  const [showArchived, setShowArchived] = useState(false);

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (!showArchived && r.is_archived) return false;
        if (statusFilter !== "All" && r.status !== statusFilter) return false;
        return true;
      }),
    [rows, statusFilter, showArchived]
  );

  const archive = useMutation<Quotation>();
  const [confirmId, setConfirmId] = useState<Quotation["quote_id"] | null>(null);
  const [archivingId, setArchivingId] = useState<Quotation["quote_id"] | null>(null);

  const handleArchive = useCallback(
    async (id: Quotation["quote_id"]) => {
      setArchivingId(id);
      try {
        await archive.mutate(`/api/quotations/${id}`, { is_archived: true }, "PATCH");
        refetch();
      } catch {
        // surfaced via archive.error below — no fabricated success
      } finally {
        setArchivingId(null);
        setConfirmId(null);
      }
    },
    [archive, refetch]
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
            {row.original.is_archived && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                Archived
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
          const confirming = confirmId === id;
          const archiving = archivingId === id;
          return (
            <div className="flex items-center gap-2">
              <Link
                href={`/projects/${id}`}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-primary hover:text-primary"
              >
                Open
              </Link>
              {row.original.is_archived ? null : confirming ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Archive?</span>
                  <button
                    type="button"
                    onClick={() => handleArchive(id)}
                    disabled={archiving}
                    className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {archiving ? "…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(id)}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-400 transition hover:border-red-300 hover:text-red-500"
                >
                  <Archive className="h-3 w-3" /> Archive
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [confirmId, archivingId, handleArchive]
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
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-primary"
          />
          Show archived
        </label>
      </div>

      {archive.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t archive that project: {archive.error.message}
        </div>
      )}

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
