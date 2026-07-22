"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { useClients } from "@/hooks/useClients";
import { useCreateQuotation } from "@/hooks/useQuotationGeneration";
import { PH_REGIONS, type PhRegion } from "@/types/entities/common";
import type { Quotation } from "@/types/entities";
import type { Client } from "@/lib/dev/provisional/quotationGenerationTypes";

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";
const labelCls = "text-xs font-semibold uppercase tracking-wide text-gray-600";

interface ClientPickerProps {
  selected: Client | null;
  onSelect: (client: Client) => void;
}

// Search-select-or-create combobox — outside-click-to-close, same convention as
// components/forms/SpecializationSelect.tsx. Single-select (unlike that one), and the "no
// match" state offers an inline quick-create instead of being purely a fixed list.
function ClientPicker({ selected, onSelect }: ClientPickerProps) {
  const { clients, isLoading, error, refetch, createClient, isCreating, createError } = useClients();
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

  const handleCreate = async () => {
    const name = query.trim();
    if (!name) return;
    try {
      const created = await createClient({ client_name: name });
      onSelect(created);
      setOpen(false);
      setQuery("");
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
          <QueryState
            isLoading={isLoading}
            error={error}
            isEmpty={false}
            onRetry={refetch}
            emptyTitle=""
            minHeight={60}
          >
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
                disabled={isCreating}
                onClick={handleCreate}
                className="flex w-full items-center gap-2 border-t border-gray-100 px-3.5 py-2.5 text-left text-sm font-semibold text-primary transition hover:bg-orange-50/50 disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                {isCreating ? "Creating…" : `Create "${query.trim()}" as a new client`}
              </button>
            )}
            {filtered.length === 0 && !query.trim() && (
              <p className="px-3.5 py-3 text-xs text-gray-400">No clients yet — type a name to create one.</p>
            )}
          </QueryState>
          {createError && (
            <p className="flex items-center gap-1.5 border-t border-gray-100 px-3.5 py-2 text-xs text-red-500">
              <AlertTriangle className="h-3 w-3 shrink-0" /> Couldn&apos;t create client: {createError.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface ClientAndProjectStepProps {
  onContinue: (quotation: Quotation, client: Client) => void;
}

export function ClientAndProjectStep({ onContinue }: ClientAndProjectStepProps) {
  const { createQuotation, isCreating, createError } = useCreateQuotation();
  const [client, setClient] = useState<Client | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [projectRegion, setProjectRegion] = useState<PhRegion | "">("");
  const [touched, setTouched] = useState(false);

  const clientValid = client !== null;
  const nameValid = projectName.trim().length > 0;
  const locationValid = projectLocation.trim().length > 0;
  const regionValid = projectRegion !== "";
  const formValid = clientValid && nameValid && locationValid && regionValid;

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

  return (
    <div className="flex max-w-xl flex-col gap-5">
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
            value={projectLocation}
            onChange={(e) => setProjectLocation(e.target.value)}
            placeholder="e.g. Quezon City"
            className={inputCls}
          />
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

      <button
        type="button"
        onClick={handleContinue}
        disabled={isCreating}
        className="flex w-fit items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
      >
        {isCreating ? "Starting…" : "Continue"}
      </button>
    </div>
  );
}