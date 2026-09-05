"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, CalendarDays, FileText, Mail, MapPin, Pencil, Phone, Search, SlidersHorizontal, Trash2, Upload, UserRound, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuotationCard } from "@/features/projects/components/QuotationCard";
import { useFetch } from "@/hooks/useFetch";
import { useClientInsights } from "@/hooks/useClientInsights";
import { apiClient } from "@/lib/api/client";
import type { Client } from "@/types/entities";

type ClientForm = {
  client_name: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  client_address: string;
  profile_picture: string;
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

function EditableDetailItem({
  icon: Icon,
  label,
  value,
  onChange,
  type = "text",
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email";
}) {
  return (
    <label className="flex min-h-24 items-start gap-3 rounded-xl bg-gray-50 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
    </label>
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
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const profilePictureInputRef = useRef<HTMLInputElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatus, setProjectStatus] = useState<"All" | "Draft" | "Final">("All");
  const [projectFiltersOpen, setProjectFiltersOpen] = useState(false);

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    return (insights?.projects ?? []).filter((project) => {
      const matchesSearch = !query || project.project_name.toLowerCase().includes(query) || project.project_region.toLowerCase().includes(query);
      return matchesSearch && (projectStatus === "All" || project.status === projectStatus);
    });
  }, [insights?.projects, projectSearch, projectStatus]);

  const openEdit = (value: Client) => {
    setEditError(null);
    setEditForm({
      client_name: value.client_name,
      contact_person: value.contact_person ?? "",
      contact_email: value.contact_email ?? "",
      contact_number: value.contact_number ?? "",
      client_address: value.client_address ?? "",
      profile_picture: value.profile_picture ?? "",
      notes: value.notes ?? "",
    });
  };

  const uploadProfilePicture = async (file: File) => {
    if (!editForm || isUploadingPicture) return;
    setIsUploadingPicture(true);
    setEditError(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const { url } = await apiClient<{ url: string }>("/api/uploads/client-profile-picture", {
        method: "POST",
        credentials: "include",
        body,
      });
      setEditForm((current) => current ? { ...current, profile_picture: url } : current);
    } catch (uploadError) {
      setEditError(uploadError instanceof Error ? uploadError.message : "Could not upload the client profile picture.");
    } finally {
      setIsUploadingPicture(false);
    }
  };

  const cancelEdit = () => {
    if (isSaving) return;
    setEditError(null);
    setEditForm(null);
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
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div
          className={`relative h-36 overflow-hidden sm:h-44 ${
            (editForm?.profile_picture ?? client.profile_picture)
              ? "bg-gray-200"
              : "client-card-gradient bg-linear-to-r from-orange-600 via-orange-400 to-amber-300"
          }`}
        >
          {(editForm?.profile_picture ?? client.profile_picture) && (
            // eslint-disable-next-line @next/next/no-img-element -- client-provided local or external image
            <img
              src={editForm?.profile_picture ?? client.profile_picture ?? ""}
              alt=""
              className="absolute inset-0 h-full w-full scale-125 object-cover blur-xl saturate-150"
              aria-hidden="true"
            />
          )}
          <div className="absolute inset-0 bg-black/15" />
          <div className="absolute -left-8 -top-12 h-32 w-32 rounded-full bg-white/20 blur-xl" />
          <div className="absolute -bottom-14 right-2 h-32 w-32 rounded-full bg-white/25 blur-2xl" />

          {!editForm && (
            <Link
              href="/projects?tab=clients"
              aria-label="Back to clients"
              title="Back to clients"
              className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-white/80 bg-white/90 text-gray-600 shadow-sm transition hover:bg-white hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}

          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold shadow-sm ${client.status === "Active" ? "bg-white text-green-700" : "bg-white text-gray-600"}`}>
              {client.status}
            </span>
            <button
              type="button"
              onClick={() => openEdit(client)}
              aria-label="Edit client"
              title="Edit client"
              disabled={editForm !== null}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/80 bg-white/90 text-gray-600 shadow-sm transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
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
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/80 bg-white/90 text-red-600 shadow-sm transition hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-6 sm:px-8">
          <div className="flex flex-col items-center text-center">
            <div className="relative z-10 -mt-16 flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-orange-50 text-2xl font-bold text-primary shadow-md sm:h-32 sm:w-32">
              {(editForm?.profile_picture ?? client.profile_picture) ? (
                // eslint-disable-next-line @next/next/no-img-element -- client-provided local or external image
                <img src={editForm?.profile_picture ?? client.profile_picture ?? ""} alt={`${client.client_name} profile`} className="h-full w-full object-cover" />
              ) : (
                initials(editForm?.client_name || client.client_name)
              )}
            </div>

            {editForm ? (
              <div className="mt-4 w-full max-w-sm">
                <input
                  value={editForm.client_name}
                  onChange={(event) => setEditForm({ ...editForm, client_name: event.target.value })}
                  aria-label="Client name"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xl font-semibold text-gray-900 outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                />
                <div className="mt-2 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={isUploadingPicture}
                    onClick={() => profilePictureInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {isUploadingPicture ? "Uploading..." : "Change picture"}
                  </button>
                  {editForm.profile_picture && (
                    <button type="button" onClick={() => setEditForm({ ...editForm, profile_picture: "" })} className="text-xs font-semibold text-gray-400 hover:text-red-500">
                      Remove
                    </button>
                  )}
                  <input
                    ref={profilePictureInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) uploadProfilePicture(file);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>
            ) : (
              <>
                <h1 className="mt-4 text-2xl font-bold text-gray-900">{client.client_name}</h1>
                <p className="mt-1 text-sm text-gray-500">{client.client_type} client</p>
              </>
            )}
          </div>

          {editError && <p className="mx-auto mt-4 max-w-3xl rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}

          <div className="mx-auto mt-6 grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {editForm ? (
              <>
                <EditableDetailItem icon={UserRound} label="Contact Person" value={editForm.contact_person} onChange={(value) => setEditForm({ ...editForm, contact_person: value })} />
                <EditableDetailItem icon={Mail} label="Email" type="email" value={editForm.contact_email} onChange={(value) => setEditForm({ ...editForm, contact_email: value })} />
                <EditableDetailItem icon={Phone} label="Contact Number" value={editForm.contact_number} onChange={(value) => setEditForm({ ...editForm, contact_number: value })} />
                <EditableDetailItem icon={MapPin} label="Address" value={editForm.client_address} onChange={(value) => setEditForm({ ...editForm, client_address: value })} />
              </>
            ) : (
              <>
                <DetailItem icon={UserRound} label="Contact Person" value={client.contact_person || "Not on file"} />
                <DetailItem icon={Mail} label="Email" value={client.contact_email || "Not on file"} />
                <DetailItem icon={Phone} label="Contact Number" value={client.contact_number || "Not on file"} />
                <DetailItem icon={MapPin} label="Address" value={client.client_address || "Not on file"} />
              </>
            )}
          </div>

          <div className="mx-auto mt-3 grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-3">
            <DetailItem icon={Building2} label="Client Type" value={client.client_type} />
            <DetailItem icon={CalendarDays} label="Client Since" value={formatDate(client.created_at)} />
            <DetailItem icon={FileText} label="Quotation Count" value={insightsLoading ? "Loading..." : `${insights?.projectCount ?? 0}`} />
          </div>

          <div className="mx-auto mt-3 max-w-5xl rounded-xl bg-gray-50 p-4 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Notes</p>
            {editForm ? (
              <textarea
                value={editForm.notes}
                onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
                aria-label="Notes"
                rows={4}
                className="mt-2 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{client.notes || "No notes on file."}</p>
            )}
          </div>

          {editForm && (
            <div className="mx-auto mt-5 flex max-w-5xl flex-col-reverse gap-2 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
              <button type="button" disabled={isSaving || isUploadingPicture} onClick={cancelEdit} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                <X className="h-4 w-4" /> Cancel
              </button>
              <button type="button" disabled={isSaving || isUploadingPicture} onClick={saveEdit} className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-(--primary-hover) disabled:opacity-50">
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Quotation Projects</h2>
          <p className="mt-0.5 text-xs text-gray-500">All quotations created for this client.</p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <span className="sr-only">Search quotation projects</span>
            <input
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
              placeholder="Search Project Name"
              className="h-11 w-full rounded-full border border-gray-200 bg-white pl-11 pr-4 text-sm text-gray-800 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setProjectFiltersOpen((open) => !open)}
              aria-label="Filter quotation projects"
              aria-expanded={projectFiltersOpen}
              className={`flex h-11 w-11 items-center justify-center rounded-full border bg-white shadow-sm transition ${projectStatus !== "All" ? "border-primary text-primary" : "border-gray-200 text-gray-500 hover:border-primary hover:text-primary"}`}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {projectFiltersOpen && (
              <div className="absolute right-0 top-[3.25rem] z-20 w-44 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                {(["All", "Draft", "Final"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setProjectStatus(status);
                      setProjectFiltersOpen(false);
                    }}
                    className={`mb-1 flex w-full items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition last:mb-0 ${projectStatus === status ? "border-primary bg-orange-50 text-primary" : "border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-primary"}`}
                  >
                    {status === "All" ? "All projects" : status}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {insightsLoading ? (
          <p className="mt-4 rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-400">Loading projects...</p>
        ) : (insights?.projects ?? []).length === 0 ? (
          <p className="mt-4 rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-500">No quotation projects yet.</p>
        ) : filteredProjects.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-500">No projects match your search or filter.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredProjects.map((project) => (
              <QuotationCard key={project.quote_id} project={project} clientName={client.client_name} />
            ))}
          </div>
        )}
      </section>

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
