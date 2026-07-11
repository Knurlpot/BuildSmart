"use client";

/**
 * DEV-ONLY AUTH BYPASS + MOCK DATA PANEL
 * ─────────────────────────────────────────────────────────────────────────
 * Floating widget for clicking through gated pages, and viewing them fully
 * populated, without a backend. Only mounted from app/layout.tsx when
 * process.env.NODE_ENV === "development" (see providers/dev-auth-bypass.ts
 * and lib/dev/mock-toggle.ts for the full removal checklists — they're
 * independent features, each removable on its own).
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
import { isDevMockEnabled, setDevMockEnabled } from "@/lib/dev/mock-toggle";

const STEPS: { step: number; label: string }[] = [
  { step: 0, label: "Step 0 — New account (Pricelist)" },
  { step: 1, label: "Step 1 — Mid-setup (locked sidebar)" },
  { step: 2, label: "Step 2 — Complete (full dashboard)" },
];

export function DevAuthBypassPanel() {
  const [enabled, setEnabled] = useState(false);
  const [step, setStep] = useState(0);
  const [mockEnabled, setMockEnabled] = useState(false);

  useEffect(() => {
    const sync = () => {
      setEnabled(isDevBypassEnabled());
      setStep(getDevBypassStep());
      setMockEnabled(isDevMockEnabled());
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

      <div className="my-3 border-t border-dashed border-yellow-400" />

      <p className="mb-2 font-bold uppercase tracking-wide text-yellow-800">
        ⚠ Mock Payload Data
      </p>
      <label className="flex items-center gap-2 font-medium text-yellow-900">
        <input
          type="checkbox"
          checked={mockEnabled}
          onChange={(e) => {
            setDevMockEnabled(e.target.checked);
            setMockEnabled(e.target.checked);
          }}
        />
        Simulate backend data (mock)
      </label>
      <p className="mt-1 text-[10px] text-yellow-700">
        Populates charts/tables/forms from fixtures for visual review. Reload or navigate
        after toggling.
      </p>

      <p className="mt-2 text-[10px] text-yellow-700">
        Dev-only — never renders in production.
      </p>
    </div>
  );
}
