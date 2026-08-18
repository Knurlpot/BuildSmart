"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Mail, Phone, Search, UserRound } from "lucide-react";
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

function clientInitials(name: string): string {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  return initials || "CL";
}

interface MyClientsTabProps {
  onClientCountChange?: (count: number) => void;
  showImport?: boolean;
  importFiles?: File[];
  importKey?: number;
}

export function MyClientsTab({ onClientCountChange, showImport = false, importFiles, importKey }: MyClientsTabProps) {
  const { clients, isLoading, error, refetch } = useClients();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter(
      (client) => client.client_name.toLowerCase().includes(query) ||
        (client.contact_person ?? "").toLowerCase().includes(query) ||
        (client.contact_email ?? "").toLowerCase().includes(query)
    );
  }, [clients, search]);

  useEffect(() => {
    onClientCountChange?.(clients.length);
  }, [clients.length, onClientCountChange]);

  return (
    <div className="flex flex-col gap-5">
      {showImport && (
        <ImportClientsPanel key={importKey} initialFiles={importFiles} importKey={importKey} onImported={() => refetch()} />
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-50 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by client name, contact person, or email..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-red-500">Couldn&apos;t load clients</p>
          <p className="mt-1 text-xs text-gray-400">{error.message}</p>
          <button type="button" onClick={refetch} className="mt-3 text-sm font-medium text-primary hover:underline">Try again</button>
        </div>
      ) : isLoading ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center text-sm text-gray-400 shadow-sm">Loading clients...</div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-primary"><UserRound className="h-6 w-6" /></div>
          <p className="mt-4 font-medium text-gray-900">No clients yet</p>
          <p className="mt-1 text-sm text-gray-500">Add a client from Quotation Generation, or import a spreadsheet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
          <p className="font-medium text-gray-900">No matching clients</p>
          <p className="mt-1 text-sm text-gray-500">Try a different name, contact person, or email.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((client) => (
            <article key={client.client_id} className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-gray-200 hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-sm font-semibold text-primary">{clientInitials(client.client_name)}</div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-gray-900">{client.client_name}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400"><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{client.client_type}</span></p>
                  </div>
                </div>
                <StatusBadge status={client.status} />
              </div>

              <div className="mt-5 space-y-2.5">
                <div className="flex items-center gap-2.5 text-sm text-gray-600"><UserRound className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{client.contact_person || "No contact person"}</span></div>
                <div className="flex items-center gap-2.5 text-sm text-gray-600"><Mail className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{client.contact_email || "No email on file"}</span></div>
                <div className="flex items-center gap-2.5 text-sm text-gray-600"><Phone className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{client.contact_number || "No phone on file"}</span></div>
              </div>

              <div className="mt-5 border-t border-gray-100 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Downpayment on File</p>
                <p className="mt-1 text-sm font-medium text-gray-700">
                  {client.default_downpayment_percentage !== null && client.default_downpayment_percentage !== undefined ? `${client.default_downpayment_percentage}%` : "Not on file"}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
