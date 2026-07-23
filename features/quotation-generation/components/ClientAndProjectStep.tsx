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
import { PH_REGIONS, type PhRegion } from "@/types/entities/common";
import { PH_CITIES } from "@/lib/ph-cities";
import type { Quotation } from "@/types/entities";
import type { Client, ClientType } from "@/lib/dev/provisional/quotationGenerationTypes";

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";
const smallInputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
const labelCls = "text-xs font-semibold uppercase tracking-wide text-gray-600";
const smallLabelCls = "text-[11px] font-semibold uppercase tracking-wide text-gray-500";

// Part D — provisional new-client fields, shaped to match the proposed `client` table (see
// quotationGenerationTypes.ts). Only client_name travels anywhere real today (as
// Client.client_name via createClient) — the rest live purely in this form until a real
// client table exists.
interface NewClientDraft {
  client_name: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  client_address: string;
  client_type: ClientType | "";
}

function emptyNewClientDraft(name: string): NewClientDraft {
  return { client_name: name, contact_person: "", contact_email: "", contact_number: "", client_address: "", client_type: "" };
}

interface ClientPickerProps {
  selected: Client | null;
  onSelect: (client: Client) => void;
}

// Search-select-or-create combobox — outside-click-to-close, same convention as
// components/forms/SpecializationSelect.tsx. Single-select (unlike that one); "no match"
// reveals the Part D provisional fields inline rather than instant-creating from a name
// alone.
function ClientPicker({ selected, onSelect }: ClientPickerProps) {
  const { clients, isLoading, error, refetch, createClient, isCreating, createError } = useClients();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<NewClientDraft | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setDraft(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filtered = clients.filter((c) => c.client_name.toLowerCase().includes(query.trim().toLowerCase()));
  const exactMatch = clients.some((c) => c.client_name.toLowerCase() === query.trim().toLowerCase());
  const draftValid = !!draft?.client_name.trim();

  const handleCreate = async () => {
    if (!draft || !draftValid) return;
    try {
      const created = await createClient({
        client_name: draft.client_name.trim(),
        contact_person: draft.contact_person.trim() || null,
        contact_email: draft.contact_email.trim() || null,
        contact_number: draft.contact_number.trim() || null,
        client_address: draft.client_address.trim() || null,
        client_type: draft.client_type || null,
      });
      onSelect(created);
      setOpen(false);
      setQuery("");
      setDraft(null);
    } catch {
      // surfaced via createError below — no fabricated success
    }
  };

  if (selected && !open) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-gray-800">{selected.client_name}</p>
          {selected.contact_email && <p className="text-xs text-gray-400">{selected.contact_email}</p>}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 text-xs font-semibold text-primary hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {!draft ? (
        <>
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
            <div className="absolute top-full left-0 z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
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
                    onClick={() => setDraft(emptyNewClientDraft(query.trim()))}
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
        </>
      ) : (
        <div className="rounded-xl border border-primary/30 bg-orange-50/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">New Client</p>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-primary">
              Provisional
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className={smallLabelCls}>
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                value={draft.client_name}
                onChange={(e) => setDraft({ ...draft, client_name: e.target.value })}
                className={smallInputCls}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className={smallLabelCls}>Contact Person</label>
                <input
                  value={draft.contact_person}
                  onChange={(e) => setDraft({ ...draft, contact_person: e.target.value })}
                  className={smallInputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={smallLabelCls}>Client Type</label>
                <select
                  value={draft.client_type}
                  onChange={(e) => setDraft({ ...draft, client_type: e.target.value as ClientType | "" })}
                  className={smallInputCls}
                >
                  <option value="">Select…</option>
                  <option value="New">New</option>
                  <option value="Returning">Returning</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className={smallLabelCls}>Contact Email</label>
                <input
                  type="email"
                  value={draft.contact_email}
                  onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })}
                  className={smallInputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={smallLabelCls}>Contact Number</label>
                <input
                  value={draft.contact_number}
                  onChange={(e) => setDraft({ ...draft, contact_number: e.target.value })}
                  className={smallInputCls}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className={smallLabelCls}>Client Address</label>
              <input
                list="qg-ph-cities"
                value={draft.client_address}
                onChange={(e) => setDraft({ ...draft, client_address: e.target.value })}
                placeholder="e.g. Quezon City"
                className={smallInputCls}
              />
              <datalist id="qg-ph-cities">
                {PH_CITIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <p className="text-[11px] text-gray-400">
              These extra details are provisional — there&apos;s no client table yet, so only
              the name travels anywhere real today. They&apos;re kept here so this form
              already matches the proposed shape and won&apos;t need rebuilding later.
            </p>

            {createError && (
              <p className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertTriangle className="h-3 w-3 shrink-0" /> Couldn&apos;t create client: {createError.message}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!draftValid || isCreating}
                onClick={handleCreate}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover) disabled:opacity-50"
              >
                {isCreating ? "Creating…" : "Create Client"}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="text-xs font-semibold text-gray-400 transition hover:text-gray-600"
              >
                Back
              </button>
            </div>
          </div>
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
  const [client, setClient] = useState<Client | null>(null);
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
  const hasUnsavedInput = client !== null || projectName.trim().length > 0 || projectLocation.trim().length > 0 || projectRegion !== "";

  const handleContinue = async () => {
    setTouched(true);
    if (!formValid || !client) return;
    try {
      // input_method defaults to 'Manual' here since the method choice is the NEXT step —
      // corrected to 'Blueprint'/'Hybrid' later via useUpdateQuotationInputMethod once the
      // actual path (and, for Hybrid, the final segment mix) is known.
      const quotation = await createQuotation({
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-base font-bold text-gray-900">Client &amp; Project</h2>
          <p className="text-xs text-gray-500">
            Pick who this quotation is for, and the basics of the project it covers.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>
            Client <span className="text-red-500">*</span>
          </label>
          <ClientPicker selected={client} onSelect={setClient} />
          {touched && !clientValid && <p className="text-xs text-red-500">Select or create a client.</p>}
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

      <ClientInsightCard client={client} quote={{ projectName, projectLocation, projectRegion }} />

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
