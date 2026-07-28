"use client";

import { AlertTriangle, Mail, MapPin, Phone, User } from "lucide-react";
import { PH_CITIES } from "@/lib/ph-cities";
import { CLIENT_TYPES, type ClientType } from "@/types/entities";

export interface NewClientDraft {
  client_name: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  client_address: string;
  client_type: ClientType | "";
}

export function emptyNewClientDraft(name: string): NewClientDraft {
  return { client_name: name, contact_person: "", contact_email: "", contact_number: "", client_address: "", client_type: "" };
}

interface NewClientFormProps {
  draft: NewClientDraft;
  onChange: (next: NewClientDraft) => void;
  onCreate: () => void;
  onCancel: () => void;
  isCreating: boolean;
  createError: Error | null;
}

const fieldCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
const labelCls = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500";

// Part B — the new-client CREATE form lives on the LEFT (plain fields, matching the rest of
// this step's form), not inside the right-side card. The card (ClientInsightCard.tsx) only
// ever shows a live PREVIEW of these fields via its `draft` prop — it never owns input state.
// Fields map 1:1 to the real `client` table (types/entities/client.ts).
export function NewClientForm({ draft, onChange, onCreate, onCancel, isCreating, createError }: NewClientFormProps) {
  const set = (patch: Partial<NewClientDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-orange-50/30 p-4">
      <div>
        <label className={labelCls}>
          Client Name <span className="text-red-500">*</span>
        </label>
        <input
          value={draft.client_name}
          onChange={(e) => set({ client_name: e.target.value })}
          placeholder="e.g. Rivercrest Family Trust"
          className={`${fieldCls} mt-1`}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            <User className="h-3 w-3" /> Contact Person
          </label>
          <input
            value={draft.contact_person}
            onChange={(e) => set({ contact_person: e.target.value })}
            className={`${fieldCls} mt-1`}
          />
        </div>
        <div>
          <label className={labelCls}>Client Type</label>
          <select
            value={draft.client_type}
            onChange={(e) => set({ client_type: e.target.value as ClientType | "" })}
            className={`${fieldCls} mt-1`}
          >
            <option value="">Select…</option>
            {CLIENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            <Mail className="h-3 w-3" /> Contact Email
          </label>
          <input
            type="email"
            value={draft.contact_email}
            onChange={(e) => set({ contact_email: e.target.value })}
            className={`${fieldCls} mt-1`}
          />
        </div>
        <div>
          <label className={labelCls}>
            <Phone className="h-3 w-3" /> Contact Number
          </label>
          <input
            value={draft.contact_number}
            onChange={(e) => set({ contact_number: e.target.value })}
            className={`${fieldCls} mt-1`}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>
          <MapPin className="h-3 w-3" /> Client Address
        </label>
        <input
          list="qg-client-form-cities"
          value={draft.client_address}
          onChange={(e) => set({ client_address: e.target.value })}
          placeholder="e.g. Quezon City"
          className={`${fieldCls} mt-1`}
        />
        <datalist id="qg-client-form-cities">
          {PH_CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {createError && (
        <p className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertTriangle className="h-3 w-3 shrink-0" /> Couldn&apos;t create client: {createError.message}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!draft.client_name.trim() || isCreating}
          onClick={onCreate}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover) disabled:opacity-50"
        >
          {isCreating ? "Creating…" : "Create Client"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-gray-400 transition hover:text-gray-600">
          Back
        </button>
      </div>
    </div>
  );
}
