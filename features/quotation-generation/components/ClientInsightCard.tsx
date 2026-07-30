"use client";

import { useState, type CSSProperties, type ComponentType } from "react";
import { Briefcase, Calendar, Hash, History, Mail, MapPin, Percent, Phone, UserCircle2 } from "lucide-react";
import { useClientInsights } from "@/hooks/useClientInsights";
import { NEUTRAL_HUE, regionToHue } from "@/lib/regionColor";
import type { Client } from "@/types/entities";

interface CurrentQuoteFacts {
  projectName: string;
  projectLocation: string;
  projectRegion: string;
}

interface ClientInsightCardProps {
  client: Client | null;
  quote: CurrentQuoteFacts;
}

const STACK_DEPTH = 2;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-white/10 px-3 py-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/60" />
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-white/45">{label}</p>
        <p className="truncate text-xs font-medium text-white">{value}</p>
      </div>
    </div>
  );
}

function HistoryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-white/10 px-3 py-2">
      <div className="flex items-center gap-1.5 text-white/45">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="text-[9px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="truncate text-xs font-bold text-white">{value}</p>
    </div>
  );
}

// Full-color glow card (Part A) — dark, saturated content layer over the same drifting-blob
// glow used by AmbientBackground.tsx, colored by a decorative Luzon/Visayas/Mindanao
// geographic hue spectrum (Part B — see lib/regionColor.ts for the non-ranking guardrail).
//
// ‼️ HONESTY LINE — read before adding a block to this card.
// REAL (shown): client_name/contact_person/contact_email/contact_number/client_address/
// client_type (real `client` columns), and the "Client History" panel's project count,
// most recent project, and downpayment-on-file — all derived from real quotation history
// via useClientInsights (COUNT/MAX over quotation rows, client.default_downpayment_percentage).
// NOT REAL (never shown): a "usual tier" (no per-quote tier is stored anywhere), "preferred
// materials" (nothing links a client to materials), or any behavioral/personality note —
// there is no column anywhere that could back these. Do not add them here no matter how
// closely this is asked to match a reference design that does show them; extend
// useClientInsights.ts's ClientInsights shape first, the day a real column exists.
export function ClientInsightCard({ client, quote }: ClientInsightCardProps) {
  const { insights, isLoading: insightsLoading, error: insightsError } = useClientInsights(client?.client_id ?? null);

  // "Identity mode" this card is currently previewing — a real selected client, or nothing.
  // Keyed coarsely so unrelated re-renders don't replay the swipe animation — only actual
  // mode/client switches do.
  const mode: "client" | "empty" = client ? "client" : "empty";
  const identityKey = mode === "client" ? `client-${client!.client_id}` : mode;

  // Swipe/stack animation state — adjusted during render (this codebase's established
  // pattern for "derive state from a prop change", e.g. the account page's deactivate
  // countdown) rather than a setState-in-effect: when the previewed identity changes, the
  // previous one is pushed onto a small fading stack behind the new card, and a fresh
  // swipeKey remounts the front card so its CSS enter-animation replays.
  const [displayedMode, setDisplayedMode] = useState(identityKey);
  const [displayedClient, setDisplayedClient] = useState<Client | null>(client);
  const [stack, setStack] = useState<Client[]>([]);
  const [swipeKey, setSwipeKey] = useState(0);

  if (identityKey !== displayedMode) {
    if (displayedClient) {
      // Dedupe by client_id before prepending — without this, swiping back to a client
      // already sitting in the stack renders two stack entries with the same key (Part A).
      setStack((prev) => [displayedClient, ...prev.filter((c) => c.client_id !== displayedClient.client_id)].slice(0, STACK_DEPTH));
    }
    setDisplayedMode(identityKey);
    setDisplayedClient(client);
    setSwipeKey((k) => k + 1);
  }

  // Part B — absolute-ish target hue for hand-built swatches (avatar/badge/footer); the CSS
  // blob layer consumes a ROTATION instead (hue-rotate() shifts a base color, it doesn't set
  // one), so that's offset from the blobs' own baked-in ~24deg brand hue.
  const hue = regionToHue(quote.projectRegion);
  const blobRotation = hue - NEUTRAL_HUE;
  const swatch = (lightness: number, saturation = 70) => `hsl(${hue}deg ${saturation}% ${lightness}%)`;

  // Prefer the real aggregate (has this client actually got quotations?) over the
  // manually-set client_type field once insights have loaded — a self-reported "Returning"
  // with zero quotations on file would be a less honest signal than the actual count.
  const isReturning = insights ? insights.hasHistory : displayedClient?.client_type === "Returning";

  const quoteProjectRow = (quote.projectName.trim() || quote.projectLocation.trim() || quote.projectRegion.trim()) && (
    <div className="mt-auto flex flex-col gap-1.5">
      {quote.projectName.trim() && <DetailRow icon={Briefcase} label="Project" value={quote.projectName.trim()} />}
      {(quote.projectLocation.trim() || quote.projectRegion.trim()) && (
        <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">New Project</span>
          <span className="truncate pl-3 text-right text-xs font-bold" style={{ color: swatch(72, 80) }}>
            {[quote.projectLocation.trim(), quote.projectRegion.trim()].filter(Boolean).join(" · ")}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative h-full" style={{ minHeight: 320 }}>
      {stack.map((c, i) => (
        <div
          key={`${c.client_id}-${i}`}
          aria-hidden
          className="absolute inset-0 rounded-3xl border border-white/10 bg-black/40"
          style={{
            transform: `translateY(${(i + 1) * 10}px) scale(${1 - (i + 1) * 0.035})`,
            opacity: 0.5 - i * 0.18,
            zIndex: 10 - i,
            filter: `blur(${(i + 1) * 2}px)`,
          }}
        />
      ))}

      <div
        key={swipeKey}
        className="qg-card-swipe-in relative z-20 flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 shadow-xl"
        style={{ minHeight: 320 }}
      >
        {/* PART A — the whole card is an ambient glow surface. Same "drifting blob"
            primitive as AmbientBackground.tsx (see app/globals.css's qg-blob rules) but
            richer and more saturated, so this card reads as the focal point against the
            workflow's much quieter backdrop. --qg-hue is Part B's decorative, non-semantic
            region hue rotation. */}
        <div
          className="qg-card-glow-layer pointer-events-none absolute inset-0"
          style={{ "--qg-hue": `${blobRotation}deg` } as CSSProperties}
        >
          <div
            className="qg-blob qg-blob-a"
            style={{ top: "-22%", left: "-12%", width: "78%", height: "78%", background: "var(--primary)", opacity: 0.75 }}
          />
          <div
            className="qg-blob qg-blob-b"
            style={{
              top: "18%",
              right: "-18%",
              width: "68%",
              height: "68%",
              background: "var(--brand-gradient-1)",
              opacity: 0.6,
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
              opacity: 0.5,
              animationDelay: "-10s",
            }}
          />
        </div>

        {/* Dark content layer — sits above the glow, saturated colors bleed through
            underneath rather than being washed out by a pale panel. White text throughout. */}
        <div
          className="relative z-10 flex h-full flex-col gap-4 p-6 backdrop-blur-xl"
          style={{ background: `hsla(${hue}, 45%, 14%, 0.82)` }}
        >
          {mode === "empty" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-white/60">
              <UserCircle2 className="h-10 w-10" />
              <p className="text-sm">Select a client to see what&apos;s on file for them.</p>
            </div>
          )}

          {mode === "client" && displayedClient && (
            <>
              {/* Status pill — real state (see isReturning above), top-left. */}
              <div className="flex items-center gap-1.5 self-start rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/85">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: swatch(60) }} />
                {isReturning ? "Returning Client" : "New Client"}
              </div>

              {/* Identity header — avatar + name + email. */}
              <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: swatch(42) }}
                >
                  {initials(displayedClient.client_name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{displayedClient.client_name}</p>
                  {(displayedClient.contact_person || displayedClient.contact_email) && (
                    <p className="truncate text-xs text-white/60">
                      {displayedClient.contact_person || displayedClient.contact_email}
                    </p>
                  )}
                </div>
              </div>

              {/* Contact blocks. */}
              <div className="flex flex-col gap-1.5">
                {displayedClient.contact_number && <DetailRow icon={Phone} label="Phone" value={displayedClient.contact_number} />}
                {displayedClient.contact_email && <DetailRow icon={Mail} label="Email" value={displayedClient.contact_email} />}
                {displayedClient.client_address && <DetailRow icon={MapPin} label="Address" value={displayedClient.client_address} />}
              </div>

              {/* Client History panel — ONLY real, derivable aggregates. See the file
                  header for exactly what is and isn't shown here and why. */}
              {insightsLoading && <p className="text-xs text-white/50">Loading history…</p>}
              {insightsError && <p className="text-xs text-white/50">Couldn&apos;t load client history.</p>}
              {insights && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Client History</p>
                  {insights.hasHistory ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      <HistoryTile icon={Hash} label="Projects" value={String(insights.projectCount)} />
                      {insights.mostRecentProject && (
                        <HistoryTile
                          icon={Calendar}
                          label="Most Recent"
                          value={formatDate(insights.mostRecentProject.created_at)}
                        />
                      )}
                      {insights.downpaymentOnFile !== null && (
                        <HistoryTile icon={Percent} label="Downpayment on File" value={`${insights.downpaymentOnFile}%`} />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-white/20 bg-white/5 px-3.5 py-3">
                      <History className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                      <p className="text-sm text-white/75">First-time client — no history on file yet.</p>
                    </div>
                  )}
                </div>
              )}

              {quoteProjectRow}
            </>
          )}
        </div>
      </div>
    </div>
  );
}