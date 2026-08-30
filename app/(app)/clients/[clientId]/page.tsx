"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Building2, CalendarDays, FileText, Mail, MapPin, Pencil, Phone, Trash2, UserRound, WalletCards } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFetch } from "@/hooks/useFetch";
import { useClientInsights } from "@/hooks/useClientInsights";
import { apiClient } from "@/lib/api/client";
import { CLIENT_TYPES, type Client } from "@/types/entities";

type ClientForm = {
  client_name: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  client_address: string;
  client_type: Client["client_type"];
  notes: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CL";
}

function DetailItem({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className="flex min-h-24 items-start gap-3 rounded-xl bg-gray-50 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="mt-1 break-words text-sm font-medium text-gray-800">{value || "Not on file"}</p>
      </div>
    </div>
  );
}

function ClientDetailsContent() {
  const router = useRouter();
  const params = useParams<{ clientId: string }>();
  const clientId = Number(params.clientId);
  const validId = Number.isInteger(clientId) ? clientId : null;
  const { data: client, isLoading, error, refetch } = useFetch<Client>(validId !== null ? `/api/clients/${validId}` : null);
  const { insights, isLoading: insightsLoading } = useClientInsights(validId);
  const [editForm, setEditForm] = useState<ClientForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const openEdit = (value: Client) => {
    setEditError(null);
    setEditForm({
      client_name: value.client_name,
      contact_person: value.contact_person ?? "",
      contact_email: value.contact_email ?? "",
      contact_number: value.contact_number ?? "",
      client_address: value.client_address ?? "",
      client_type: value.client_type,
      notes: value.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editForm || validId === null || isSaving) return;
    if (!editForm.client_name.trim()) {
      setEditError("Client name is required.");
      return;
    }
    setIsSaving(true);
    setEditError(null);
    try {
      await apiClient(`/api/clients/${validId}`, {
        method: "PATCH",
        credentials: "include",
        body: JSON.stringify(editForm),
      });
      setEditForm(null);
      refetch();
    } catch (saveError) {
      setEditError(saveError instanceof Error ? saveError.message : "Could not update this client.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteClient = async () => {
    if (validId === null || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiClient(`/api/clients/${validId}`, { method: "DELETE", credentials: "include" });
      router.push("/projects?tab=clients");
    } catch (removeError) {
      setDeleteError(removeError instanceof Error ? removeError.message : "Could not delete this client.");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400 shadow-sm">Loading client details...</div>;
  }

  if (error || !client) {
    return (
      <div className="rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <p className="font-semibold text-red-600">Couldn&apos;t load this client</p>
        <p className="mt-1 text-sm text-gray-500">{error?.message || "Client not found."}</p>
        <Link href="/projects?tab=clients" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">Return to My Clients</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/projects?tab=clients"
        aria-label="Back to clients"
        title="Back to clients"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-primary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-orange-50 text-base font-semibold text-primary">
              {initials(client.client_name)}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Client Details</p>
              <h1 className="text-xl font-semibold text-gray-900">{client.client_name}</h1>
              <p className="mt-1 text-sm text-gray-500">{client.client_type} client</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${client.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
              {client.status}
            </span>
            <button
              type="button"
              onClick={() => openEdit(client)}
              aria-label="Edit client"
              title="Edit client"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-primary hover:text-primary"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              aria-label="Delete client"
              title="Delete client"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DetailItem icon={UserRound} label="Contact Person" value={client.contact_person || "Not on file"} />
          <DetailItem icon={Mail} label="Email" value={client.contact_email || "Not on file"} />
          <DetailItem icon={Phone} label="Contact Number" value={client.contact_number || "Not on file"} />
          <DetailItem icon={MapPin} label="Address" value={client.client_address || "Not on file"} />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DetailItem icon={Building2} label="Client Type" value={client.client_type} />
          <DetailItem icon={CalendarDays} label="Client Since" value={formatDate(client.created_at)} />
          <DetailItem
            icon={WalletCards}
            label="Default Downpayment"
            value={client.default_downpayment_percentage == null ? "Not on file" : `${client.default_downpayment_percentage}%`}
          />
          <DetailItem
            icon={FileText}
            label="Quotation Count"
            value={insightsLoading ? "Loading..." : `${insights?.projectCount ?? 0}`}
          />
        </div>

        <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Notes</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{client.notes || "No notes on file."}</p>
        </div>

        {insights?.mostRecentProject && (
          <div className="mt-5 rounded-xl border border-gray-100 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Most Recent Project</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{insights.mostRecentProject.project_name}</p>
            <p className="mt-1 text-xs text-gray-500">Created {formatDate(insights.mostRecentProject.created_at)}</p>
          </div>
        )}
      </section>

      <Dialog open={editForm !== null} onOpenChange={(open) => !open && !isSaving && setEditForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update the client information on file.</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="grid gap-3">
              <input value={editForm.client_name} onChange={(event) => setEditForm({ ...editForm, client_name: event.target.value })} placeholder="Client name" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20" />
              <input value={editForm.contact_person} onChange={(event) => setEditForm({ ...editForm, contact_person: event.target.value })} placeholder="Contact person" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={editForm.contact_email} onChange={(event) => setEditForm({ ...editForm, contact_email: event.target.value })} placeholder="Email" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20" />
                <input value={editForm.contact_number} onChange={(event) => setEditForm({ ...editForm, contact_number: event.target.value })} placeholder="Contact number" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20" />
              </div>
              <input value={editForm.client_address} onChange={(event) => setEditForm({ ...editForm, client_address: event.target.value })} placeholder="Address" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20" />
              <select value={editForm.client_type} onChange={(event) => setEditForm({ ...editForm, client_type: event.target.value as Client["client_type"] })} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20">
                {CLIENT_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
              <textarea value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} placeholder="Notes" rows={3} className="resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20" />
            </div>
          )}
          {editError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <DialogFooter>
            <button type="button" disabled={isSaving} onClick={() => setEditForm(null)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="button" disabled={isSaving} onClick={saveEdit} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-(--primary-hover) disabled:opacity-50">{isSaving ? "Saving..." : "Save Changes"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => !isDeleting && setDeleteOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete client?</DialogTitle>
            <DialogDescription>Delete {client.client_name} and detach this client from related records?</DialogDescription>
          </DialogHeader>
          {deleteError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}
          <DialogFooter>
            <button type="button" disabled={isDeleting} onClick={() => setDeleteOpen(false)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="button" disabled={isDeleting} onClick={deleteClient} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">{isDeleting ? "Deleting..." : "Delete Client"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ClientDetailsPage() {
  return (
    <RequireOnboardingStep minStep={2}>
      <ClientDetailsContent />
    </RequireOnboardingStep>
  );
}
