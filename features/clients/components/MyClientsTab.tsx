"use client";

// PART B (Task 6) — Open Projects' "My Clients" tab. List view reads the REAL `client` table
// via useClients() (types/entities/client.ts) — nothing here is a new provisional store, the
// entity was already real before this task. Only the spreadsheet import (ImportClientsPanel)
// is new, and its own endpoints are the provisional/assumed ones (see useClientImport.ts).
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Search, Upload } from "lucide-react";
import { DataTable } from "@/components/data-table/DataTable";
import { useClients } from "@/hooks/useClients";
import { ImportClientsPanel } from "./ImportClientsPanel";
import type { Client } from "@/types/entities";

function StatusBadge({ status }: { status: Client["status"] }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

export function MyClientsTab() {
  const { clients, isLoading, error, refetch } = useClients();
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.client_name.toLowerCase().includes(q) ||
        (c.contact_person ?? "").toLowerCase().includes(q) ||
        (c.contact_email ?? "").toLowerCase().includes(q)
    );
  }, [clients, search]);

  const columns = useMemo<ColumnDef<Client>[]>(
    () => [
      { accessorKey: "client_name", header: "Client" },
      {
        id: "contact",
        header: "Contact",
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <div>
            <p className="text-sm text-gray-700">{row.original.contact_person ?? <span className="text-gray-300">—</span>}</p>
            <p className="text-xs text-gray-400">{row.original.contact_email ?? row.original.contact_number ?? ""}</p>
          </div>
        ),
      },
      { accessorKey: "client_type", header: "Type", enableGlobalFilter: false },
      {
        id: "downpayment",
        header: "Downpayment on File",
        enableGlobalFilter: false,
        cell: ({ row }) =>
          row.original.default_downpayment_percentage !== null && row.original.default_downpayment_percentage !== undefined ? (
            <span className="text-sm text-gray-700">{row.original.default_downpayment_percentage}%</span>
          ) : (
            <span className="text-xs text-gray-300">Not on file</span>
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        enableGlobalFilter: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {filtered.length} of {clients.length} client{clients.length !== 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
        >
          <Upload className="h-4 w-4" /> {showImport ? "Hide Import" : "Import from Spreadsheet"}
        </button>
      </div>

      {showImport && (
        <ImportClientsPanel
          onImported={() => {
            refetch();
          }}
        />
      )}

      <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="relative flex-1 min-w-50">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name, contact person, or email…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {error ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <p className="text-sm font-semibold text-red-500">Couldn&apos;t load clients</p>
            <p className="text-xs text-gray-400">{error.message}</p>
          </div>
        ) : isLoading ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400">Loading clients…</div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <p className="text-sm font-semibold text-gray-500">No clients yet</p>
            <p className="text-xs text-gray-400">Add a client from Quotation Generation, or import a spreadsheet above.</p>
          </div>
        ) : (
          <DataTable columns={columns} data={filtered} globalFilter={search} initialSorting={[{ id: "client_name", desc: false }]} />
        )}
      </div>
    </div>
  );
}
