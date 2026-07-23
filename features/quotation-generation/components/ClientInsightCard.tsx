"use client";

import { useState, type CSSProperties } from "react";
import { History, UserCircle2 } from "lucide-react";
import { useClientInsights } from "@/hooks/useClientInsights";
import type { Client } from "@/lib/dev/provisional/quotationGenerationTypes";

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
// Bounded so every region variant stays a recognizable relative of the brand's warm
// orange/red palette (hue-ROTATING those same colors) rather than drifting into unrelated
// hues like blue or green that would clash with the rest of the app. ±35deg keeps the
// brand's ~24deg (orange) base hue within roughly pink-red (349deg) to gold (59deg) —
// verified visually to stay warm at both extremes, unlike a wider range which starts to
// read as yellow-green at one end.
const HUE_ROTATION_RANGE_DEG = 35;

// PART B — region-derived hue is DECORATIVE ONLY. Region is a location, nothing else: this
// deliberately has no legend, no label, and no red/amber/green (or any) semantic scale —
// adding one would imply the color means something about the client, which is exactly what
// the honesty constraint above rules out. It's just a stable hash so the same region always
// lands on the same hue and different clients feel visually distinct; a blank region (none
// selected yet) is the neutral default (0deg — the unmodified brand palette).
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function regionHueRotation(region: string): number {
  if (!region.trim()) return 0;
  return (hashString(region) % (HUE_ROTATION_RANGE_DEG * 2 + 1)) - HUE_ROTATION_RANGE_DEG;
}

// Richly-styled (full ambient glow surface, glassy/frosted content layer) but
// content-honest shell. ‼️ There is no client entity in the schema yet, so there is no data
// source for project counts, tiers, averages, or risk/payment flags — none of that is
// rendered here, ever. See hooks/useClientInsights.ts for the full explanation; this
// component only has ONE branch (the honest "no history" one) on purpose. It is NOT gated
// behind a `hasHistory` check with a second, invented branch for "if true" — building that
// branch would mean guessing at a shape the backend hasn't defined, which is exactly what
// the honesty constraint rules out. Extend this file (and ClientInsights) the day a real
// history endpoint exists.
export function ClientInsightCard({ client, quote }: ClientInsightCardProps) {
  const { insights } = useClientInsights(client?.client_id ?? null);

  // Swipe/stack animation state — adjusted during render (this codebase's established
  // pattern for "derive state from a prop change", e.g. the account page's deactivate
  // countdown) rather than a setState-in-effect: when the selected client changes, the
  // previously-displayed client is pushed onto a small fading stack behind the new card,
  // and a fresh swipeKey remounts the front card so its CSS enter-animation replays.
  const [displayed, setDisplayed] = useState<Client | null>(client);
  const [stack, setStack] = useState<Client[]>([]);
  const [swipeKey, setSwipeKey] = useState(0);

  if ((client?.client_id ?? null) !== (displayed?.client_id ?? null)) {
    if (displayed) setStack((prev) => [displayed, ...prev].slice(0, STACK_DEPTH));
    setDisplayed(client);
    setSwipeKey((k) => k + 1);
  }

  const hasQuoteFacts = quote.projectName.trim() || quote.projectLocation.trim() || quote.projectRegion.trim();
  const hueRotation = regionHueRotation(quote.projectRegion);

  return (
    <div className="relative" style={{ minHeight: 280 }}>
      {stack.map((c, i) => (
        <div
          key={c.client_id}
          aria-hidden
          className="absolute inset-0 rounded-3xl border border-white/50 bg-white/60"
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
        className="qg-card-swipe-in relative z-20 flex h-full flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-xl"
        style={{ minHeight: 280 }}
      >
        {/* PART A — the whole card is an ambient glow surface now (previously a white
            panel with a thin accent stripe). Same "drifting blob" primitive as
            AmbientBackground.tsx (see app/globals.css's qg-blob rules) but richer and more
            saturated, so this card reads as the focal point against the workflow's much
            quieter backdrop. --qg-hue is Part B's decorative, non-semantic region hue. */}
        <div
          className="qg-card-glow-layer pointer-events-none absolute inset-0"
          style={{ "--qg-hue": `${hueRotation}deg` } as CSSProperties}
        >
          <div
            className="qg-blob qg-blob-a"
            style={{
              top: "-22%",
              left: "-12%",
              width: "78%",
              height: "78%",
              background: "var(--primary)",
              opacity: 0.55,
            }}
          />
          <div
            className="qg-blob qg-blob-b"
            style={{
              top: "18%",
              right: "-18%",
              width: "68%",
              height: "68%",
              background: "var(--brand-gradient-1)",
              opacity: 0.4,
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
              opacity: 0.32,
              animationDelay: "-10s",
            }}
          />
        </div>

        {/* Frosted content layer — sits above the glow so text stays legible regardless of
            how saturated the blobs underneath get. */}
        <div className="relative z-10 flex h-full flex-col gap-4 bg-white/55 p-6 backdrop-blur-xl">
          {!displayed ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-gray-500">
              <UserCircle2 className="h-10 w-10" />
              <p className="text-sm">Select a client to see what&apos;s on file for them.</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Client</p>
                <h3 className="text-lg font-bold text-gray-900">{displayed.client_name}</h3>
                {displayed.contact_person && <p className="text-sm text-gray-700">{displayed.contact_person}</p>}
                {displayed.contact_email && <p className="text-xs text-gray-500">{displayed.contact_email}</p>}
              </div>

              {/* The one and only history state — see the file header for why there is no
                  "if hasHistory" branch here. */}
              {insights && !insights.hasHistory && (
                <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-gray-300 bg-white/70 px-3.5 py-3">
                  <History className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                  <p className="text-sm text-gray-700">First-time client — no history on file yet.</p>
                </div>
              )}

              {hasQuoteFacts && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">This Quote</p>
                  {quote.projectName.trim() && <p className="text-sm font-medium text-gray-900">{quote.projectName}</p>}
                  {(quote.projectLocation.trim() || quote.projectRegion.trim()) && (
                    <p className="text-xs text-gray-600">
                      {[quote.projectLocation.trim(), quote.projectRegion.trim()].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              )}

              <p className="mt-auto text-[11px] text-gray-500">
                {displayed.client_name} has no prior quotations on file
                {quote.projectName.trim() ? ` — this quote will be their first with you.` : "."}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
