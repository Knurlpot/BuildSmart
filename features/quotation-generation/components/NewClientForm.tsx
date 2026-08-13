"use client";

import { AlertTriangle, Mail, MapPin, Phone, User, UserPlus } from "lucide-react";
import { formatPhMobileNationalNumber, normalizePhMobileDigits } from "@/lib/ph-phone";
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
  return { client_name: name, contact_person: "", contact_email: "", contact_number: "", client_address: "" };
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
  const contactDigits = normalizePhMobileDigits(draft.contact_number);
  const hue = region.trim() ? regionToHue(region) : NEUTRAL_HUE;
  const accent = `hsl(${hue} 72% 58%)`;
  const accentBg = `hsl(${hue} 72% 58% / 0.16)`;
  const accentText = `hsl(${hue} 80% 88%)`;
  const accentBorder = `hsl(${hue} 70% 72% / 0.32)`;
  const panelBg = `hsla(${hue}, 45%, 14%, 0.9)`;
  const fieldBg = `hsla(${hue}, 38%, 18%, 0.58)`;
  const fieldBorder = `hsla(${hue}, 42%, 72%, 0.18)`;

  const fieldCls =
    "peer w-full rounded-lg border pb-2 pt-5 text-sm text-white placeholder:text-transparent outline-none transition focus:ring-2";
  const floatingLabelCls =
    "pointer-events-none absolute top-1.5 text-[10px] font-semibold text-white/50 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold";

  return (
    <div
      className="flex h-full flex-col gap-4 rounded-3xl border p-5 shadow-xl"
      style={{ minHeight: 320, background: panelBg, borderColor: accentBorder }}
    >
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
        <div className="relative min-w-0 flex-1">
          <input
            value={draft.client_name}
            onChange={(e) => set({ client_name: e.target.value })}
            placeholder=" "
            aria-label="Client name"
            className="peer w-full truncate bg-transparent pb-0.5 pt-4 text-sm font-bold text-white outline-none placeholder:text-transparent"
            autoFocus
          />
          <label className="pointer-events-none absolute left-0 top-0 text-[10px] font-semibold text-white/45 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-0 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold">
            Client Name
          </label>
          <p className="mt-0.5 text-[10px] text-white/50">First-time client. No history on file yet.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
          <input
            value={draft.contact_person}
            onChange={(e) => set({ contact_person: e.target.value })}
            placeholder=" "
            className={`${fieldCls} pl-9 pr-3`}
            style={{ background: fieldBg, borderColor: fieldBorder, "--tw-ring-color": accent } as React.CSSProperties}
          />
          <label className={`${floatingLabelCls} left-9`}>Contact Person</label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <input
              type="email"
              value={draft.contact_email}
              onChange={(e) => set({ contact_email: e.target.value })}
              placeholder=" "
              className={`${fieldCls} pl-9 pr-3`}
              style={{ background: fieldBg, borderColor: fieldBorder, "--tw-ring-color": accent } as React.CSSProperties}
            />
            <label className={floatingLabelCls + " left-9"}>Contact Email</label>
          </div>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm font-semibold text-white/75">+63</span>
            <input
              inputMode="numeric"
              value={formatPhMobileNationalNumber(contactDigits)}
              onChange={(e) => set({ contact_number: normalizePhMobileDigits(e.target.value) })}
              placeholder=" "
              maxLength={12}
              className={`${fieldCls} pl-[4.45rem] pr-3`}
              style={{ background: fieldBg, borderColor: fieldBorder, "--tw-ring-color": accent } as React.CSSProperties}
            />
            <label className={floatingLabelCls + " left-[4.45rem]"}>Contact Number</label>
          </div>
        </div>

        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
          {/* Plain text — no city dropdown/datalist. A client's billing/site address isn't
              confined to the region select's city list above it. */}
          <input
            value={draft.client_address}
            onChange={(e) => set({ client_address: e.target.value })}
            placeholder=" "
            className={`${fieldCls} pl-9 pr-3`}
            style={{ background: fieldBg, borderColor: fieldBorder, "--tw-ring-color": accent } as React.CSSProperties}
          />
          <label className={floatingLabelCls + " left-9"}>Client Address</label>
        </div>

        {/* Part B — Client Type is never a choice here: every client this form creates is
            'New' by definition. "Returning" only becomes true once a later quotation
            actually references this client (see ClientInsightCard.tsx's isReturning) — shown
            locked, not as an editable dropdown. */}
        <div className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ background: fieldBg, borderColor: fieldBorder }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Client Type</span>
          <span className="text-xs font-bold text-white/80">New</span>
        </div>
      </div>

      {createError && (
        <p className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t create client: {createError.message}
        </p>
      )}

      <div className="mt-auto flex items-center gap-2 border-t pt-4" style={{ borderColor: fieldBorder }}>
        <button
          type="button"
          disabled={!draft.client_name.trim() || isCreating}
          onClick={onCreate}
          className="rounded-lg px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
          style={{ background: `hsl(${hue} 74% 52%)` }}
        >
          {isCreating ? "Creating…" : "Create Client"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-white/50 transition hover:text-white">
          Back
        </button>
      </div>
    </div>
  );
}
