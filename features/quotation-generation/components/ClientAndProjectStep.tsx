"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
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
import { formatPhMobileE164, normalizePhMobileDigits } from "@/lib/ph-phone";
import { ClientInsightCard } from "./ClientInsightCard";
import { NewClientForm, emptyNewClientDraft, type NewClientDraft } from "./NewClientForm";
import { PH_REGIONS, type PhRegion } from "@/types/entities/common";
import type { Client, Quotation } from "@/types/entities";

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";
const labelCls = "text-xs font-semibold uppercase tracking-wide text-gray-600";
const floatingInputCls =
  "peer pb-2 pt-5 placeholder:text-transparent";
const floatingLabelBaseCls =
  "pointer-events-none absolute left-4 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary";
const floatingSelectLabelCls =
  "pointer-events-none absolute left-4 text-gray-500 transition-all";
const floatingSelectLabelRestCls = "top-1/2 -translate-y-1/2 text-sm font-medium";
const floatingSelectLabelActiveCls = "top-1.5 translate-y-0 text-[10px] font-semibold";

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Part F — a single reason sentence beside the (disabled) Continue button, replacing
// per-field red error text. Null once everything required is filled in.
function buildContinueHint(state: { clientValid: boolean; nameValid: boolean; locationValid: boolean; regionValid: boolean }): string | null {
  const clauses: string[] = [];
  if (!state.clientValid) clauses.push("select a client");
  const missingProjectFields: string[] = [];
  if (!state.nameValid) missingProjectFields.push("project name");
  if (!state.locationValid) missingProjectFields.push("location");
  if (!state.regionValid) missingProjectFields.push("region");
  if (missingProjectFields.length > 0) clauses.push(`add a ${joinWithAnd(missingProjectFields)}`);
  if (clauses.length === 0) return null;
  const sentence = joinWithAnd(clauses);
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} to continue.`;
}

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
// hands off to the parent (the actual new-client fields live in the RIGHT-column card, not
// inline here — see NewClientForm.tsx).
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
    return (
      <ChipRow
        title={creatingName ? `Creating "${creatingName}"` : "Creating a new client"}
        subtitle="Fill in the form below, then Create Client."
        actionLabel="Cancel"
        onAction={onCancelCreate}
      />
    );
  }

  if (selected && !open) {
    return <ChipRow title={selected.client_name} actionLabel="Change" onAction={() => { setOpen(true); onChangeSelected(); }} />;
  }

  return (
    <div ref={containerRef} className="relative">
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
                className="flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left text-sm transition hover:bg-gray-50"
              >
                <span className="font-medium text-gray-800">{c.client_name}</span>
                <span className="text-xs text-gray-400">{c.contact_email || "No email on file"}</span>
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
                {`Create "${query.trim()}" as a new client`}
              </button>
            )}
            {filtered.length === 0 && !query.trim() && (
              <p className="px-3.5 py-3 text-xs text-gray-400">No clients yet. Type a name to create one.</p>
            )}
          </QueryState>
        </div>
      )}
    </div>
  );
}

interface ClientAndProjectStepProps {
  onContinue: (quotation: Quotation, client: Client) => void;
  onExit: () => void | Promise<void>;
}

export function ClientAndProjectStep({ onContinue, onExit }: ClientAndProjectStepProps) {
  const { createQuotation, isCreating, createError } = useCreateQuotation();
  const { clients, isLoading: clientsLoading, error: clientsError, refetch: refetchClients, createClient, isCreating: isCreatingClient, createError: createClientError, resetCreate } = useClients();

  const [client, setClient] = useState<Client | null>(null);
  const [draft, setDraft] = useState<NewClientDraft | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [projectRegion, setProjectRegion] = useState<PhRegion | "">("");
  const [projectNameFocused, setProjectNameFocused] = useState(false);
  const [projectLocationFocused, setProjectLocationFocused] = useState(false);
  const [projectRegionFocused, setProjectRegionFocused] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const clientValid = client !== null;
  const nameValid = projectName.trim().length > 0;
  const locationValid = projectLocation.trim().length > 0;
  const regionValid = projectRegion !== "";
  const formValid = clientValid && nameValid && locationValid && regionValid;
  const hasUnsavedInput =
    client !== null || draft !== null || projectName.trim().length > 0 || projectLocation.trim().length > 0 || projectRegion !== "";

  const continueHint = buildContinueHint({ clientValid, nameValid, locationValid, regionValid });
  const projectRegionFloated = projectRegionFocused || projectRegion !== "";

  const handleStartCreate = (name: string) => {
    resetCreate();
    setDraft(emptyNewClientDraft(name));
  };

  const handleCreateSubmit = async () => {
    if (!draft || !draft.client_name.trim()) return;
    try {
      // Part G — OPEN DECISION, do not resolve here: client persistence happens in Part
      // 2's quote-save flow; whether a client row is created explicitly (this button) or
      // auto-saved when the quote is finalized is TBD. This button is the one and only
      // place a client row gets created from THIS step — never on keystroke, never
      // implicitly from clicking Continue below. Avoid creating client rows from mere
      // inquiries (e.g. someone just trying out the search box).
      //
      // company_id/client_id/status/created_at are never invented here — company_id comes
      // from the session server-side, client_id is read back from the response.
      const contactDigits = normalizePhMobileDigits(draft.contact_number);
      const contactNumber = contactDigits ? formatPhMobileE164(contactDigits) : null;
      const created = await createClient({
        client_name: draft.client_name.trim(),
        contact_person: draft.contact_person.trim() || null,
        contact_email: draft.contact_email.trim() || null,
        // Store Philippine mobile numbers in E.164 form (+639171234567); an untouched
        // input has no digits and is saved as blank.
        contact_number: contactNumber,
        client_address: draft.client_address.trim() || null,
        // Part B — never a user choice at creation: every client this form creates starts
        // 'New'. "Returning" is a system-derived state set once a later quotation actually
        // references this client, not something picked here.
        client_type: "New",
      });
      // FIX 1 — lib/dev/mockFetch.ts's /api/clients/new always echoes back the SAME fixture
      // row (client_id 5004, "New Provisional Client") no matter what was submitted — that
      // mock layer deliberately ignores request bodies (see its file header). Trusting
      // `created` verbatim here is exactly what made "Create Client" look like it looped
      // back to a stale provisional client: the name/details on screen were the fixture's,
      // never what was actually typed. Same fix CPRM's forms already use for the identical
      // mock limitation — keep only what only the server can assign (client_id, company_id,
      // status, created_at) and rebuild every user-entered field from the draft itself. A
      // real backend will echo the submitted fields back exactly, at which point `created`
      // alone becomes sufficient again.
      setClient({
        ...created,
        client_name: draft.client_name.trim(),
        contact_person: draft.contact_person.trim() || null,
        contact_email: draft.contact_email.trim() || null,
        contact_number: contactNumber,
        client_address: draft.client_address.trim() || null,
        client_type: "New",
      });
      setDraft(null);
    } catch {
      // surfaced via createClientError below — no fabricated success
    }
  };

  const handleContinue = async () => {
    if (!formValid || !client) return;
    try {
      // input_method defaults to 'Manual' here since the method choice is the NEXT step —
      // corrected to 'Blueprint'/'Hybrid' later via useUpdateQuotationInputMethod once the
      // actual path (and, for Hybrid, the final segment mix) is known.
      const created = await createQuotation({
        client_id: client.client_id,
        project_name: projectName.trim(),
        project_location: projectLocation.trim(),
        project_region: projectRegion as PhRegion,
        input_method: "Manual",
      });
      // Same fix as Create Client (NewClientForm) — lib/dev/mockFetch.ts's /api/quotations/
      // new echoes back a FIXED fixture row regardless of what was submitted (that mock
      // layer deliberately ignores request bodies). Left untouched, everything downstream
      // — the wizard's own header, and now Open Projects (P2's whole point) — would show a
      // stale fixture project name/location/region instead of what was actually typed here.
      // Keep only what only the server can assign (quote_id, company_id, status,
      // timestamps) and rebuild every user-entered field from this form. A real backend
      // will echo the submitted fields back exactly, at which point `created` alone becomes
      // sufficient again.
      const quotation: Quotation = {
        ...created,
        project_name: projectName.trim(),
        project_location: projectLocation.trim(),
        project_region: projectRegion as PhRegion,
        input_method: "Manual",
      };
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
    void onExit();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Part D — no redundant "Client & Project" heading here: the wizard already shows
          "New Quotation" + "Select a client and the basics of the project" one level up, so
          this column (and the card beside it) starts right away, higher on the page. */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
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
        </div>

        <div className="relative">
          <input
            id="quotation-project-name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onFocus={() => setProjectNameFocused(true)}
            onBlur={() => setProjectNameFocused(false)}
            placeholder=" "
            className={`${inputCls} ${floatingInputCls}`}
          />
          <label htmlFor="quotation-project-name" className={floatingLabelBaseCls}>
            Project Name <span className="text-red-500">*</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
            {/* Part E — plain free text (quotation.project_location, VARCHAR): the user
                types a city/location, no suggestion dropdown. Region below is the real
                enum and keeps its <select>; location is not the same thing as region. */}
            <input
              id="quotation-project-location"
              value={projectLocation}
              onChange={(e) => setProjectLocation(e.target.value)}
              onFocus={() => setProjectLocationFocused(true)}
              onBlur={() => setProjectLocationFocused(false)}
              placeholder=" "
              className={`${inputCls} ${floatingInputCls}`}
            />
            <label htmlFor="quotation-project-location" className={floatingLabelBaseCls}>
              Project Location <span className="text-red-500">*</span>
            </label>
          </div>
          <div className="relative">
            <select
              id="quotation-project-region"
              value={projectRegion}
              onChange={(e) => setProjectRegion(e.target.value as PhRegion)}
              onFocus={() => setProjectRegionFocused(true)}
              onBlur={() => setProjectRegionFocused(false)}
              aria-label="Region"
              className={`${inputCls} ${floatingInputCls}`}
            >
              <option value=""></option>
              {PH_REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <label
              htmlFor="quotation-project-region"
              className={`${floatingSelectLabelCls} ${projectRegionFloated ? floatingSelectLabelActiveCls : floatingSelectLabelRestCls} ${projectRegionFocused ? "text-primary" : ""}`}
            >
              Region <span className="text-red-500">*</span>
            </label>
          </div>
        </div>

        {createError && (
          <p className="flex items-center gap-1.5 text-xs text-red-500">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t start this quotation: {createError.message}
          </p>
        )}

        <div className="flex flex-col gap-2">
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
              disabled={!formValid || isCreating}
              aria-label={continueHint ? `Continue disabled. ${continueHint}` : undefined}
              className="flex w-fit items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? "Starting…" : "Continue"}
            </button>
          </div>
        </div>
      </div>

      {/* Right column — Part B: while a new client is being entered, this slot becomes the
          actual editable form (NewClientForm), not a read-only preview; the left column
          never grows a second client-fields block for it. Once a client is selected (or
          nothing is), ClientInsightCard resumes its normal read-only preview/empty state. */}
      {draft ? (
        <NewClientForm
          draft={draft}
          onChange={setDraft}
          onCreate={handleCreateSubmit}
          onCancel={() => setDraft(null)}
          isCreating={isCreatingClient}
          createError={createClientError}
          region={projectRegion}
        />
      ) : (
        <ClientInsightCard
          client={client}
          quote={{
            projectName: projectNameFocused ? "" : projectName,
            projectLocation: projectLocationFocused ? "" : projectLocation,
            projectRegion,
          }}
        />
      )}

      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this quotation?</DialogTitle>
            <DialogDescription>
              You&apos;ve entered client and project details that haven&apos;t been saved.
              Leaving now discards them. Nothing has been created yet.
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
              onClick={() => void onExit()}
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
