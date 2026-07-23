interface AmbientBackgroundProps {
  /** Step 2's blueprint viewer needs a quiet backdrop so the polygon overlay stays legible
   * — the glow is turned WAY down (not off) rather than removed, so the workflow doesn't
   * suddenly feel like a different page. */
  dimmed?: boolean;
}

// Subtle, diffused, animated glow behind the whole Quotation Generation workflow — a much
// quieter cousin of both the login/signup brand panel's animate-brand-gradient AND this
// same workflow's client insight card (ClientInsightCard.tsx): same warm brand palette and
// "drifting blob" primitive (see app/globals.css), but far lower opacity and no per-region
// hue variation, so the background always recedes and the card always reads as the focal
// point. Pure CSS, transform-only animation (see globals.css's perf note) — no animation
// library.
export function AmbientBackground({ dimmed = false }: AmbientBackgroundProps) {
  return (
    <div
      aria-hidden
      className={`qg-ambient-mesh pointer-events-none absolute inset-0 -z-10 overflow-hidden transition-opacity duration-700 ${
        dimmed ? "opacity-[0.015]" : "opacity-[0.05]"
      }`}
    >
      <div
        className="qg-blob qg-blob-a"
        style={{
          top: "-10%",
          left: "5%",
          width: "55%",
          height: "55%",
          background: "var(--brand-gradient-2)",
        }}
      />
      <div
        className="qg-blob qg-blob-b"
        style={{
          top: "10%",
          right: "0%",
          width: "45%",
          height: "45%",
          background: "var(--brand-gradient-1)",
          animationDelay: "-6s",
        }}
      />
      <div
        className="qg-blob qg-blob-c"
        style={{
          bottom: "-15%",
          left: "30%",
          width: "60%",
          height: "60%",
          background: "var(--brand-gradient-3)",
          animationDelay: "-12s",
        }}
      />
    </div>
  );
}
