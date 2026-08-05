// Reuses the exact "drifting blurred blob" CSS system already established for Quotation
// Generation's backdrop (features/quotation-generation/components/AmbientBackground.tsx +
// app/globals.css's qg-ambient-mesh/qg-blob rules) rather than inventing a second ambient
// effect — same classes, same brand-gradient tokens, just its own instance so this
// marketing-only component doesn't reach across the QG feature boundary for a plain
// presentational div. Pure CSS, transform-only animation; already has a
// prefers-reduced-motion override at the .qg-blob rule itself.
export function AmbientGlow() {
  return (
    <div aria-hidden className="qg-ambient-mesh pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-[0.07]">
      <div className="qg-blob qg-blob-a" style={{ top: "-10%", left: "5%", width: "55%", height: "55%", background: "var(--brand-gradient-2)" }} />
      <div className="qg-blob qg-blob-b" style={{ top: "10%", right: "0%", width: "45%", height: "45%", background: "var(--brand-gradient-1)", animationDelay: "-6s" }} />
      <div className="qg-blob qg-blob-c" style={{ bottom: "-15%", left: "30%", width: "60%", height: "60%", background: "var(--brand-gradient-3)", animationDelay: "-12s" }} />
    </div>
  );
}
