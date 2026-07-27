"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClients } from "@/hooks/useClients";
import { useCreateQuotation } from "@/hooks/useQuotationGeneration";
import { ClientInsightCard } from "./ClientInsightCard";
import { NewClientFormCard, emptyNewClientDraft, type NewClientDraft } from "./NewClientFormCard";
import { PH_REGIONS, type PhRegion } from "@/types/entities/common";
import { PH_CITIES } from "@/lib/ph-cities";
import type { Client, Quotation } from "@/types/entities";

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";
const labelCls = "text-xs font-semibold uppercase tracking-wide text-gray-600";

interface ClientPickerProps {
  clients: Client[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  selected: Client | null;
  creatingName: string | null;
  onSelect: (client: Client) => void;
  onStartCreate: (name: string) => void;
  onChangeSelected: () => void;
  onCancelCreate: () => void;
}

function ChipRow({ title, subtitle, actionLabel, onAction }: { title: string; subtitle?: string | null; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-800">{title}</p>
        {subtitle && <p className="truncate text-xs text-gray-400">{subtitle}</p>}
      </div>
      <button type="button" onClick={onAction} className="shrink-0 text-xs font-semibold text-primary hover:underline">
        {actionLabel}
      </button>
    </div>
  );
}

// Search-select-or-create combobox — outside-click-to-close, same convention as
// components/forms/SpecializationSelect.tsx. Single-select (unlike that one); "no match"
// hands off to the parent (Part C: the actual new-client fields live in the right-side
// card, not inline here) rather than instant-creating from a name alone.
function ClientPicker({
  clients,
  isLoading,
  error,
  refetch,
  selected,
  creatingName,
  onSelect,
  onStartCreate,
  onChangeSelected,
  onCancelCreate,
}: ClientPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filtered = clients.filter((c) => c.client_name.toLowerCase().includes(query.trim().toLowerCase()));
  const exactMatch = clients.some((c) => c.client_name.toLowerCase() === query.trim().toLowerCase());

  if (creatingName !== null) {
    return <ChipRow title={`Creating "${creatingName}"`} subtitle="Fill in the card below, then Create Client." actionLabel="Cancel" onAction={onCancelCreate} />;
  }

  if (selected && !open) {
    return <ChipRow title={selected.client_name} subtitle={selected.contact_email} actionLabel="Change" onAction={() => { setOpen(true); onChangeSelected(); }} />;
  }

  return (
    // z-30 (well above ClientInsightCard/NewClientFormCard's z-10 content layer sitting
    // right below in the same column) — without it, that card's backdrop-blur layer forms
    // its own stacking context and intercepts clicks meant for this dropdown, even though
    // the dropdown itself is z-20; giving the whole picker a higher explicit stack keeps it
    // unambiguously on top regardless of the card's internal stacking.
    <div ref={containerRef} className="relative z-30">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search clients, or type a new name…"
          className={`${inputCls} pl-9`}
          autoFocus={!!selected}
        />
      </div>

      {open && (
        <div className="absolute top-full left-0 z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          <QueryState isLoading={isLoading} error={error} isEmpty={false} onRetry={refetch} emptyTitle="" minHeight={60}>
            {filtered.map((c) => (
              <button
                key={c.client_id}
                type="button"
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full flex-col items-start px-3.5 py-2.5 text-left text-sm transition hover:bg-gray-50"
              >
                <span className="font-medium text-gray-800">{c.client_name}</span>
                {c.contact_email && <span className="text-xs text-gray-400">{c.contact_email}</span>}
              </button>
            ))}
            {query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => {
                  onStartCreate(query.trim());
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 border-t border-gray-100 px-3.5 py-2.5 text-left text-sm font-semibold text-primary transition hover:bg-orange-50/50"
              >
                <Plus className="h-3.5 w-3.5" />
                {`Create "${query.trim()}" as a new client`}
              </button>
            )}
            {filtered.length === 0 && !query.trim() && (
              <p className="px-3.5 py-3 text-xs text-gray-400">No clients yet — type a name to create one.</p>
            )}
          </QueryState>
        </div>
      )}
    </div>
  );
}

interface ClientAndProjectStepProps {
  onContinue: (quotation: Quotation, client: Client) => void;
}

export function ClientAndProjectStep({ onContinue }: ClientAndProjectStepProps) {
  const router = useRouter();
  const { createQuotation, isCreating, createError } = useCreateQuotation();
  const { clients, isLoading: clientsLoading, error: clientsError, refetch: refetchClients, createClient, isCreating: isCreatingClient, createError: createClientError, resetCreate } = useClients();

  const [client, setClient] = useState<Client | null>(null);
  const [draft, setDraft] = useState<NewClientDraft | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [projectRegion, setProjectRegion] = useState<PhRegion | "">("");
  const [touched, setTouched] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const clientValid = client !== null;
  const nameValid = projectName.trim().length > 0;
  const locationValid = projectLocation.trim().length > 0;
  const regionValid = projectRegion !== "";
  const formValid = clientValid && nameValid && locationValid && regionValid;
  const hasUnsavedInput =
    client !== null || draft !== null || projectName.trim().length > 0 || projectLocation.trim().length > 0 || projectRegion !== "";

  const handleStartCreate = (name: string) => {
    resetCreate();
    setDraft(emptyNewClientDraft(name));
  };

  const handleCreateSubmit = async () => {
    if (!draft || !draft.client_name.trim()) return;
    try {
      // company_id/client_id/status/created_at are never invented here — company_id comes
      // from the session server-side, client_id is read back from the response.
      const created = await createClient({
        client_name: draft.client_name.trim(),
        contact_person: draft.contact_person.trim() || null,
        contact_email: draft.contact_email.trim() || null,
        contact_number: draft.contact_number.trim() || null,
        client_address: draft.client_address.trim() || null,
        // schema DEFAULTs to 'New' if unset at the DB level — supplying the same default
        // here just makes the client-side ClientInsights badge correct immediately,
        // without waiting on a refetch.
        client_type: draft.client_type || "New",
      });
      setClient(created);
      setDraft(null);
    } catch {
      // surfaced via createClientError below — no fabricated success
    }
  };

  const handleContinue = async () => {
    setTouched(true);
    if (!formValid || !client) return;
    try {
      // input_method defaults to 'Manual' here since the method choice is the NEXT step —
      // corrected to 'Blueprint'/'Hybrid' later via useUpdateQuotationInputMethod once the
      // actual path (and, for Hybrid, the final segment mix) is known.
      const quotation = await createQuotation({
        client_id: client.client_id,
        project_name: projectName.trim(),
        project_location: projectLocation.trim(),
        project_region: projectRegion as PhRegion,
        input_method: "Manual",
      });
      onContinue(quotation, client);
    } catch {
      // surfaced via createError below — no fabricated success
    }
  };

  const handleCancelClick = () => {
    if (hasUnsavedInput) {
      setCancelConfirmOpen(true);
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-base font-bold text-gray-900">Client &amp; Project</h2>
          <p className="text-xs text-gray-500">
            Pick who this quotation is for, and the basics of the project it covers.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>
            Project Name <span className="text-red-500">*</span>
          </label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g. Rivercrest Residence Roof Waterproofing"
            className={inputCls}
          />
          {touched && !nameValid && <p className="text-xs text-red-500">Project name is required.</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>
              Project Location <span className="text-red-500">*</span>
            </label>
            <input
              list="qg-ph-cities-project"
              value={projectLocation}
              onChange={(e) => setProjectLocation(e.target.value)}
              placeholder="e.g. Quezon City"
              className={inputCls}
            />
            <datalist id="qg-ph-cities-project">
              {PH_CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {touched && !locationValid && <p className="text-xs text-red-500">Location is required.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>
              Region <span className="text-red-500">*</span>
            </label>
            <select
              value={projectRegion}
              onChange={(e) => setProjectRegion(e.target.value as PhRegion)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {PH_REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            {touched && !regionValid && <p className="text-xs text-red-500">Select a region.</p>}
          </div>
        </div>

        {createError && (
          <p className="flex items-center gap-1.5 text-xs text-red-500">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t start this quotation: {createError.message}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancelClick}
            className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={isCreating}
            className="flex w-fit items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
          >
            {isCreating ? "Starting…" : "Continue"}
          </button>
        </div>
      </div>

      {/* Right column owns client identity end-to-end (Part C): search/select at the top,
          then either the read-only insight card (existing client) or the new-client input
          form (creating), never both at once. */}
      <div className="flex flex-col gap-3">
        <label className={labelCls}>
          Client <span className="text-red-500">*</span>
        </label>
        <ClientPicker
          clients={clients}
          isLoading={clientsLoading}
          error={clientsError}
          refetch={refetchClients}
          selected={client}
          creatingName={draft?.client_name ?? null}
          onSelect={setClient}
          onStartCreate={handleStartCreate}
          onChangeSelected={() => setClient(null)}
          onCancelCreate={() => setDraft(null)}
        />
        {touched && !clientValid && <p className="text-xs text-red-500">Select or create a client.</p>}

        {draft ? (
          <NewClientFormCard
            draft={draft}
            onChange={setDraft}
            onCreate={handleCreateSubmit}
            onCancel={() => setDraft(null)}
            isCreating={isCreatingClient}
            createError={createClientError}
            region={projectRegion}
          />
        ) : (
          <ClientInsightCard client={client} quote={{ projectName, projectLocation, projectRegion }} />
        )}
      </div>

      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this quotation?</DialogTitle>
            <DialogDescription>
              You&apos;ve entered client and project details that haven&apos;t been saved.
              Leaving now discards them — nothing has been created yet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCancelConfirmOpen(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Keep Editing
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
            >
              Discard
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
