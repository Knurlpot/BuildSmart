"use client";

import { AlertTriangle, Mail, MapPin, Phone, User, UserPlus } from "lucide-react";
import { NEUTRAL_HUE, regionToHue } from "@/lib/regionColor";

export interface NewClientDraft {
  client_name: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  client_address: string;
}

// Part B — a brand-new client is always created as 'New'; "Returning" is a system-derived
// state (set once a later quotation actually references this client — see
// ClientInsightCard.tsx's isReturning), never a manual choice at creation time. There is no
// client_type field on this draft at all: the caller supplies the literal 'New' when it
// actually creates the row (see ClientAndProjectStep.tsx's handleCreateSubmit).
export function emptyNewClientDraft(name: string): NewClientDraft {
  // "+63 " is a helpful DEFAULT, not a validated format — landlines and other valid PH
  // numbers don't all fit the 10-digit mobile pattern, so this is freely editable/replaceable
  // plain text, never masked or hard-rejected (Part B).
  return { client_name: name, contact_person: "", contact_email: "", contact_number: "+63 ", client_address: "" };
}

interface NewClientFormProps {
  draft: NewClientDraft;
  onChange: (next: NewClientDraft) => void;
  onCreate: () => void;
  onCancel: () => void;
  isCreating: boolean;
  createError: Error | null;
  // Decorative continuity only — the same region-hue spectrum ClientInsightCard uses for a
  // selected/returning client, so the accent doesn't jump when a new-client draft later
  // becomes a real client. Purely cosmetic; never drives validation or persistence.
  region?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Part B — light/low-key card: white base, soft region-tinted accents, color used sparingly
// (badge, icons, focus ring) rather than the saturated full-bleed fill ClientInsightCard uses
// for a selected client. This is the RIGHT-column card while a new client is being entered —
// it replaces ClientInsightCard's preview in that slot entirely (see
// ClientAndProjectStep.tsx); the left column stays project-fields-only.
export function NewClientForm({ draft, onChange, onCreate, onCancel, isCreating, createError, region = "" }: NewClientFormProps) {
  const set = (patch: Partial<NewClientDraft>) => onChange({ ...draft, ...patch });
  const hue = region.trim() ? regionToHue(region) : NEUTRAL_HUE;
  const accent = `hsl(${hue} 70% 42%)`;
  const accentBg = `hsl(${hue} 60% 50% / 0.1)`;
  const accentText = `hsl(${hue} 65% 32%)`;
  const accentBorder = `hsl(${hue} 55% 55% / 0.25)`;

  const fieldCls =
    "w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-300 outline-none transition focus:ring-2";
  const labelCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400";

  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm" style={{ minHeight: 320 }}>
      <div
        className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{ background: accentBg, color: accentText }}
      >
        <UserPlus className="h-3 w-3" /> New Client
      </div>

      <div
        className="flex items-center gap-3 rounded-xl px-3 py-3"
        style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold"
          style={{ background: `hsl(${hue} 55% 50% / 0.18)`, color: accentText, border: `1.5px solid ${accentBorder}` }}
        >
          {initials(draft.client_name)}
        </div>
        <div className="min-w-0 flex-1">
          <input
            value={draft.client_name}
            onChange={(e) => set({ client_name: e.target.value })}
            placeholder="Client name"
            className="w-full truncate bg-transparent text-sm font-bold text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400"
            autoFocus
          />
          <p className="mt-0.5 text-[10px] text-gray-400">First-time client — no history on file yet.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>Contact Person</label>
          <div className="relative flex items-center">
            <User className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-gray-300" />
            <input
              value={draft.contact_person}
              onChange={(e) => set({ contact_person: e.target.value })}
              placeholder="e.g. Juan dela Cruz"
              className={fieldCls}
              style={{ "--tw-ring-color": accent } as React.CSSProperties}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Contact Email</label>
            <div className="relative flex items-center">
              <Mail className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-gray-300" />
              <input
                type="email"
                value={draft.contact_email}
                onChange={(e) => set({ contact_email: e.target.value })}
                placeholder="e.g. juan@company.com"
                className={fieldCls}
                style={{ "--tw-ring-color": accent } as React.CSSProperties}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Contact Number</label>
            <div className="relative flex items-center">
              <Phone className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-gray-300" />
              {/* Part B — "+63 " is only a starting default (see emptyNewClientDraft); this
                  is plain free text with a generous soft cap, never a hard mask. Landlines
                  and other valid PH formats don't fit a fixed mobile-length pattern, so
                  nothing here rejects them. */}
              <input
                value={draft.contact_number}
                onChange={(e) => set({ contact_number: e.target.value })}
                placeholder="+63 917 123 4567"
                maxLength={20}
                className={fieldCls}
                style={{ "--tw-ring-color": accent } as React.CSSProperties}
              />
            </div>
          </div>
        </div>

        <div>
          <label className={labelCls}>Client Address</label>
          <div className="relative flex items-center">
            <MapPin className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-gray-300" />
            {/* Plain text — no city dropdown/datalist. A client's billing/site address isn't
                confined to the region select's city list above it. */}
            <input
              value={draft.client_address}
              onChange={(e) => set({ client_address: e.target.value })}
              placeholder="e.g. Unit 4B, Eastwood, Quezon City"
              className={fieldCls}
              style={{ "--tw-ring-color": accent } as React.CSSProperties}
            />
          </div>
        </div>

        {/* Part B — Client Type is never a choice here: every client this form creates is
            'New' by definition. "Returning" only becomes true once a later quotation
            actually references this client (see ClientInsightCard.tsx's isReturning) — shown
            locked, not as an editable dropdown. */}
        <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Client Type</span>
          <span className="text-xs font-bold text-gray-500">New</span>
        </div>
      </div>

      {createError && (
        <p className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t create client: {createError.message}
        </p>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-gray-100 pt-4">
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
