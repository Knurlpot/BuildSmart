"use client";

import type { CSSProperties } from "react";
import { AlertTriangle, Mail, MapPin, Phone, User, UserPlus } from "lucide-react";
import { NEUTRAL_HUE, regionToHue } from "@/lib/regionColor";
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

interface NewClientFormCardProps {
  draft: NewClientDraft;
  onChange: (next: NewClientDraft) => void;
  onCreate: () => void;
  onCancel: () => void;
  isCreating: boolean;
  createError: Error | null;
  region: string;
}

const fieldCls =
  "w-full rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";
const labelCls = "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500";

// Part C — the right-side card doubles as the new-client input FORM (rather than a
// picker-embedded draft panel) once a typed name has no existing match. Same glow-card
// shell/family as ClientInsightCard.tsx (drifting blobs, region hue, swipe-in on mount) but
// a light content layer — form inputs need to stay legible/editable, which is why the
// prototype this look is modeled on also switches to a light card specifically for this
// state. Fields map 1:1 to the real `client` table (types/entities/client.ts); they persist
// via useClients().createClient on submit, not before.
export function NewClientFormCard({ draft, onChange, onCreate, onCancel, isCreating, createError, region }: NewClientFormCardProps) {
  const hue = regionToHue(region);
  const blobRotation = hue - NEUTRAL_HUE;
  const accent = `hsl(${hue}deg 70% 45%)`;

  const set = (patch: Partial<NewClientDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="relative" style={{ minHeight: 320 }}>
      <div className="qg-card-swipe-in relative z-20 flex flex-col overflow-hidden rounded-3xl border border-black/5 shadow-xl">
        <div
          className="qg-card-glow-layer pointer-events-none absolute inset-0"
          style={{ "--qg-hue": `${blobRotation}deg` } as CSSProperties}
        >
          <div
            className="qg-blob qg-blob-a"
            style={{ top: "-22%", left: "-12%", width: "78%", height: "78%", background: "var(--primary)", opacity: 0.28 }}
          />
          <div
            className="qg-blob qg-blob-b"
            style={{
              top: "18%",
              right: "-18%",
              width: "68%",
              height: "68%",
              background: "var(--brand-gradient-1)",
              opacity: 0.2,
              animationDelay: "-5s",
            }}
          />
          <div
            className="qg-blob qg-blob-c"
            style={{
              bottom: "-28%",
              left: "18%",
              width: "82%",
              height: "82%",
              background: "var(--brand-gradient-3)",
              opacity: 0.16,
              animationDelay: "-10s",
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col gap-4 p-6 backdrop-blur-xl" style={{ background: "rgba(255, 253, 250, 0.95)" }}>
          <div className="flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ background: `${accent}22`, color: accent }}>
            <UserPlus className="h-3 w-3" />
            New Client
          </div>

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
            <p className="flex items-center gap-1.5 text-xs text-red-600">
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
      </div>
    </div>
  );
}
