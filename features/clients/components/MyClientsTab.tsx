"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Building2, Ellipsis, Mail, Pencil, Phone, Search, Trash2, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { useClients } from "@/hooks/useClients";
import { ImportClientsPanel } from "./ImportClientsPanel";
import { CLIENT_TYPES, type Client } from "@/types/entities";

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

type ClientEditForm = {
  client_name: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  client_address: string;
  client_type: Client["client_type"];
  notes: string;
};

function editFormFor(client: Client): ClientEditForm {
  return {
    client_name: client.client_name,
    contact_person: client.contact_person ?? "",
    contact_email: client.contact_email ?? "",
    contact_number: client.contact_number ?? "",
    client_address: client.client_address ?? "",
    client_type: client.client_type,
    notes: client.notes ?? "",
  };
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
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState<ClientEditForm | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
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

  useEffect(() => {
    onClientCountChange?.(clients.length);
  }, [clients.length, onClientCountChange]);

  const handleDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiClient(`/api/clients/${deleteTarget.client_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setDeleteTarget(null);
      await refetch();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete this client.");
    } finally {
      setIsDeleting(false);
    }
  };

  const openEdit = (client: Client) => {
    setOpenMenuId(null);
    setEditClient(client);
    setEditForm(editFormFor(client));
    setEditError(null);
  };

  const patchEditForm = (patch: Partial<ClientEditForm>) => {
    setEditForm((current) => (current ? { ...current, ...patch } : current));
  };

  const handleSaveEdit = async () => {
    if (!editClient || !editForm || isSavingEdit) return;
    if (!editForm.client_name.trim()) {
      setEditError("Client name is required.");
      return;
    }
    setIsSavingEdit(true);
    setEditError(null);
    try {
      await apiClient(`/api/clients/${editClient.client_id}`, {
        method: "PATCH",
        credentials: "include",
        body: JSON.stringify(editForm),
      });
      setEditClient(null);
      setEditForm(null);
      await refetch();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update this client.");
    } finally {
      setIsSavingEdit(false);
    }
  };

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
            <article
              key={client.client_id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/clients/${client.client_id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  router.push(`/clients/${client.client_id}`);
                }
              }}
              className="group cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-gray-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-sm font-semibold text-primary">{clientInitials(client.client_name)}</div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-gray-900">{client.client_name}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400"><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{client.client_type}</span></p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={client.status} />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenMenuId((current) => (current === client.client_id ? null : client.client_id));
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
                      aria-label={`Actions for ${client.client_name}`}
                      title="Actions"
                    >
                      <Ellipsis className="h-4 w-4" />
                    </button>
                    {openMenuId === client.client_id && (
                      <div className="absolute right-0 top-full z-20 mt-2 w-36 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(client);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId(null);
                            setDeleteError(null);
                            setDeleteTarget(client);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                <div className="flex items-center gap-2.5 text-sm text-gray-600"><UserRound className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{client.contact_person || "No contact person"}</span></div>
                <div className="flex items-center gap-2.5 text-sm text-gray-600"><Mail className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{client.contact_email || "No email on file"}</span></div>
                <div className="flex items-center gap-2.5 text-sm text-gray-600"><Phone className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{client.contact_number || "No phone on file"}</span></div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={editClient !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditClient(null);
            setEditForm(null);
            setEditError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update the client information on file.</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="grid gap-3">
              <input
                value={editForm.client_name}
                onChange={(event) => patchEditForm({ client_name: event.target.value })}
                placeholder="Client name"
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
              />
              <input
                value={editForm.contact_person}
                onChange={(event) => patchEditForm({ contact_person: event.target.value })}
                placeholder="Contact person"
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={editForm.contact_email}
                  onChange={(event) => patchEditForm({ contact_email: event.target.value })}
                  placeholder="Email"
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                />
                <input
                  value={editForm.contact_number}
                  onChange={(event) => patchEditForm({ contact_number: event.target.value })}
                  placeholder="Contact number"
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <input
                value={editForm.client_address}
                onChange={(event) => patchEditForm({ client_address: event.target.value })}
                placeholder="Address"
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
              />
              <select
                value={editForm.client_type}
                onChange={(event) => patchEditForm({ client_type: event.target.value as Client["client_type"] })}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
              >
                {CLIENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <textarea
                value={editForm.notes}
                onChange={(event) => patchEditForm({ notes: event.target.value })}
                placeholder="Notes"
                rows={3}
                className="resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
          {editError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{editError}</div>}
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setEditClient(null);
                setEditForm(null);
                setEditError(null);
              }}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={isSavingEdit}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-(--primary-hover) disabled:opacity-60"
            >
              {isSavingEdit ? "Saving..." : "Save Changes"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete client?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `Delete ${deleteTarget.client_name} and detach this client from related records?` : "This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {deleteError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</div>}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
