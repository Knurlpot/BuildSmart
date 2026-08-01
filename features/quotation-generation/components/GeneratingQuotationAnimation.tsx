"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface GeneratingQuotationAnimationProps {
  /** Fires once every stage has played through. Optional — a caller previewing this in
   * isolation doesn't need to supply one. */
  onComplete?: () => void;
}

// FIX 5 / P2-A — DECORATIVE LOADING SHELL for the Configure -> Generate transition (see
// QuotationGenerationWizard.tsx's "generating" phase). The pricing DERIVATION it appears to
// lead into is still mock-driven (lib/dev/provisional/quotationBreakdownFixtures.ts) — this
// component itself never computes anything, it just plays for a fixed duration and hands
// control back via onComplete.
//
// HONESTY LINE (read before touching the copy below):
// - Every stage label describes the REAL, already-documented computation order (CLAUDE.md
//   §4 item 5: base price -> supplier discount -> strategy markup -> parallel
//   unit-conversion/wastage + labor -> grand total). This is rule-based computation over
//   the segments/pricelist/company-rules the user already entered — NOT a lookup against
//   "stored templates," and the copy must never imply that mechanism.
// - No fabricated peso figures, counters, or "live" data appear anywhere in this
//   animation. There is nothing real to show yet (Part 2 hasn't computed anything) — the
//   two shuffling cards are blank placeholders (a label and a decorative bar), never a
//   number.
const STAGES = [
  "Calculating base pricing from your segments…",
  "Applying supplier discounts…",
  "Applying your pricing strategy & markup…",
  "Factoring in wastage, unit conversion & labor…",
  "Finalizing your Economic & Premium quotations…",
];

const STAGE_DURATION_MS = 1100;

export function GeneratingQuotationAnimation({ onComplete }: GeneratingQuotationAnimationProps) {
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    if (stageIdx >= STAGES.length) {
      onComplete?.();
      return;
    }
    const timer = setTimeout(() => setStageIdx((i) => i + 1), STAGE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [stageIdx, onComplete]);

  const progress = Math.min(100, Math.round((stageIdx / STAGES.length) * 100));
  const currentLabel = STAGES[Math.min(stageIdx, STAGES.length - 1)];

  return (
    <div className="flex flex-col items-center gap-8 rounded-2xl border border-gray-100 bg-white px-6 py-14">
      {/* Shuffling-cards flourish (Replit-style) — two blank placeholder cards drifting
          past each other. Framed as PROCESSING, never as searching/matching anything. */}
      <div className="relative flex h-28 w-full items-center justify-center">
        <div className="qg-generate-card qg-generate-card-economic absolute flex h-20 w-36 flex-col justify-between rounded-2xl border-2 border-primary/30 bg-orange-50/60 p-3 shadow-md">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Economic</span>
          <div className="h-2 w-2/3 rounded-full bg-primary/20" />
        </div>
        <div className="qg-generate-card qg-generate-card-premium absolute flex h-20 w-36 flex-col justify-between rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 p-3 shadow-md">
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Premium</span>
          <div className="h-2 w-2/3 rounded-full bg-indigo-200" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        <p className="text-sm font-bold text-gray-900">Generating your quotation…</p>
        <div className="h-1.5 w-64 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-gray-400" role="status" aria-live="polite">
          {currentLabel}
        </p>
      </div>
    </div>
  );
}