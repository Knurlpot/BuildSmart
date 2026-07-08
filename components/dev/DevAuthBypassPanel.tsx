"use client";

/**
 * DEV-ONLY AUTH BYPASS PANEL
 * ─────────────────────────────────────────────────────────────────────────
 * Floating widget for clicking through gated pages without a backend.
 * Only mounted from app/layout.tsx when process.env.NODE_ENV === "development"
 * (see providers/dev-auth-bypass.ts for the full removal checklist).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from "react";
import {
  DEV_BYPASS_CHANGE_EVENT,
  getDevBypassStep,
  isDevBypassEnabled,
  setDevBypassEnabled,
  setDevBypassStep,
} from "@/providers/dev-auth-bypass";

const STEPS: { step: number; label: string }[] = [
  { step: 0, label: "Step 0 — New account (Pricelist)" },
  { step: 1, label: "Step 1 — Mid-setup (locked sidebar)" },
  { step: 2, label: "Step 2 — Complete (full dashboard)" },
];

export function DevAuthBypassPanel() {
  const [enabled, setEnabled] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const sync = () => {
      setEnabled(isDevBypassEnabled());
      setStep(getDevBypassStep());
    };
    sync();
    window.addEventListener(DEV_BYPASS_CHANGE_EVENT, sync);
    return () => window.removeEventListener(DEV_BYPASS_CHANGE_EVENT, sync);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-64 rounded-lg border-2 border-dashed border-yellow-500 bg-yellow-50 p-3 text-xs shadow-lg">
      <p className="mb-2 font-bold uppercase tracking-wide text-yellow-800">
        ⚠ Dev Auth Bypass
      </p>

      <label className="mb-2 flex items-center gap-2 font-medium text-yellow-900">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setDevBypassEnabled(e.target.checked)}
        />
        Simulate logged-in user
      </label>

      <div className={`flex flex-col gap-1 ${enabled ? "" : "pointer-events-none opacity-40"}`}>
        {STEPS.map((s) => (
          <button
            key={s.step}
            type="button"
            onClick={() => setDevBypassStep(s.step)}
            className={`rounded px-2 py-1 text-left transition ${
              enabled && step === s.step
                ? "bg-yellow-500 font-semibold text-yellow-950"
                : "bg-white text-yellow-900 hover:bg-yellow-100"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[10px] text-yellow-700">
        Dev-only — never renders in production.
      </p>
    </div>
  );
}
