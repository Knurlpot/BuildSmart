/**
 * DEV-ONLY AUTH BYPASS
 * ─────────────────────────────────────────────────────────────────────────
 * Lets you click through the gated pages (onboarding, dashboard, sidebar
 * locks) without a running backend, by faking an authenticated user in
 * AuthProvider. Controlled by the floating panel in
 * components/dev/DevAuthBypassPanel.tsx.
 *
 * SAFE FOR PRODUCTION: every export here is gated on
 * `process.env.NODE_ENV === "development"`, which Next.js inlines and
 * dead-code-eliminates at build time — none of this runs in a prod build.
 *
 * REMOVE WHEN THE REAL BACKEND IS LIVE:
 *   - delete this file
 *   - remove the "DEV-ONLY AUTH BYPASS" block in providers/AuthProvider.tsx
 *   - remove <DevAuthBypassPanel /> and its import from app/layout.tsx
 *   - delete components/dev/DevAuthBypassPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { AuthUser } from "@/lib/api/auth";

const IS_DEV = process.env.NODE_ENV === "development";

const ENABLED_KEY = "bs-dev-bypass-enabled";
const STEP_KEY = "bs-dev-bypass-step";
export const DEV_BYPASS_CHANGE_EVENT = "bs-dev-bypass-change";

export function isDevBypassAvailable(): boolean {
  return IS_DEV;
}

export function isDevBypassEnabled(): boolean {
  if (!IS_DEV || typeof window === "undefined") return false;
  return window.localStorage.getItem(ENABLED_KEY) === "true";
}

export function getDevBypassStep(): number {
  if (!IS_DEV || typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(STEP_KEY);
  const step = raw ? Number(raw) : 0;
  return Number.isFinite(step) ? step : 0;
}

export function setDevBypassEnabled(enabled: boolean) {
  if (!IS_DEV || typeof window === "undefined") return;
  window.localStorage.setItem(ENABLED_KEY, String(enabled));
  window.dispatchEvent(new Event(DEV_BYPASS_CHANGE_EVENT));
}

export function setDevBypassStep(step: number) {
  if (!IS_DEV || typeof window === "undefined") return;
  window.localStorage.setItem(STEP_KEY, String(step));
  window.localStorage.setItem(ENABLED_KEY, "true");
  window.dispatchEvent(new Event(DEV_BYPASS_CHANGE_EVENT));
}

export function getDevBypassUser(): AuthUser {
  return {
    id: "dev-bypass-user",
    email: "dev@buildsmart.local",
    companyId: "dev-bypass-company",
    onboardingStep: getDevBypassStep(),
  };
}
