"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Building2, Check, EllipsisVertical, Mail, Phone, Search, Trash2, UserRound, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
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

function ClientTypeBadge({ client }: { client: Client }) {
  const quotationCount = client.quotation_project_count ?? (client.client_type === "Returning" ? 1 : 0);
  const isReturning = quotationCount > 0;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${isReturning ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-primary"}`}>
      {isReturning ? "RETURNING" : "NEW"}
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
  const router = useRouter();
  const { clients, isLoading, error, refetch } = useClients();
  const [search, setSearch] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<number>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter(
      (client) => client.client_name.toLowerCase().includes(query) ||
        (client.contact_person ?? "").toLowerCase().includes(query) ||
        (client.contact_email ?? "").toLowerCase().includes(query)
    );
  }, [clients, search]);
  const selectedClients = useMemo(() => clients.filter((client) => selectedClientIds.has(client.client_id)), [clients, selectedClientIds]);
  const selectedCount = selectedClients.length;

  const toggleClientSelection = (clientId: number) => {
    setSelectedClientIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const stopSelecting = () => {
    setSelectMode(false);
    setSelectedClientIds(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedClients.length === 0 || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await Promise.all(
        selectedClients.map((client) =>
          apiClient(`/api/clients/${client.client_id}`, {
            method: "DELETE",
            credentials: "include",
          })
        )
      );
      setBatchDeleteOpen(false);
      stopSelecting();
      await refetch();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete selected clients.");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    onClientCountChange?.(clients.length);
  }, [clients.length, onClientCountChange]);

  return (
    <div className="flex flex-col gap-5">
      {showImport && (
        <ImportClientsPanel key={importKey} initialFiles={importFiles} importKey={importKey} onImported={() => refetch()} />
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-50 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by client name, contact person, or email..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {selectMode ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">{selectedCount} selected</span>
              <button
                type="button"
                onClick={() => setBatchDeleteOpen(true)}
                disabled={selectedCount === 0}
                aria-label="Delete selected clients"
                title="Delete selected clients"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={stopSelecting}
                aria-label="Cancel selection"
                title="Cancel selection"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setActionsOpen((open) => !open)}
                aria-label="Client card actions"
                title="Client card actions"
                aria-expanded={actionsOpen}
                aria-haspopup="menu"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:border-primary hover:text-primary"
              >
                <EllipsisVertical className="h-5 w-5" />
              </button>
              {actionsOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-36 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      setSelectMode(true);
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
          {filtered.map((client) => {
            const selected = selectedClientIds.has(client.client_id);
            return (
            <article
              key={client.client_id}
              role="link"
              tabIndex={0}
              onClick={() => {
                if (selectMode) {
                  toggleClientSelection(client.client_id);
                  return;
                }
                router.push(`/clients/${client.client_id}`);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  if (selectMode) {
                    event.preventDefault();
                    toggleClientSelection(client.client_id);
                    return;
                  }
                  router.push(`/clients/${client.client_id}`);
                }
              }}
              className={`group relative cursor-pointer rounded-2xl border bg-white p-5 shadow-sm transition-all hover:border-gray-200 hover:shadow-md ${
                selected ? "border-primary ring-2 ring-primary/15" : "border-gray-100"
              }`}
            >
              {selectMode && (
                <span
                  className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-md border ${
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-gray-300 bg-white text-transparent"
                  }`}
                  aria-hidden="true"
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-sm font-semibold text-primary">{clientInitials(client.client_name)}</div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-gray-900">{client.client_name}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{client.quotation_project_count ?? 0} quotation project{(client.quotation_project_count ?? 0) === 1 ? "" : "s"}</span>
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ClientTypeBadge client={client} />
                  <StatusBadge status={client.status} />
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                <div className="flex items-center gap-2.5 text-sm text-gray-600"><UserRound className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{client.contact_person || "No contact person"}</span></div>
                <div className="flex items-center gap-2.5 text-sm text-gray-600"><Mail className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{client.contact_email || "No email on file"}</span></div>
                <div className="flex items-center gap-2.5 text-sm text-gray-600"><Phone className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{client.contact_number || "No phone on file"}</span></div>
              </div>
            </article>
            );
          })}
        </div>
      )}

      <Dialog open={batchDeleteOpen} onOpenChange={(open) => !open && !isDeleting && setBatchDeleteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected clients?</DialogTitle>
            <DialogDescription>
              Delete {selectedCount} selected client{selectedCount === 1 ? "" : "s"} and detach them from related records?
            </DialogDescription>
          </DialogHeader>
          {deleteError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</div>}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setBatchDeleteOpen(false)}
              disabled={isDeleting}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={isDeleting || selectedCount === 0}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {isDeleting ? "Deleting..." : `Delete ${selectedCount}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
