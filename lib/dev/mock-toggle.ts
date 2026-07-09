/**
 * DEV-ONLY MOCK PAYLOAD TOGGLE
 * ─────────────────────────────────────────────────────────────────────────
 * Lets a human see every built page populated without a backend, by making
 * useFetch resolve from lib/dev/fixtures/ instead of the network. Controlled
 * by the "Simulate backend data (mock)" section in
 * components/dev/DevAuthBypassPanel.tsx.
 *
 * SAFE FOR PRODUCTION — verified, not just asserted: a plain top-level
 * `import` of the fixture resolver (lib/dev/mockFetch.ts) is ALWAYS included
 * in the bundle regardless of any runtime `if` around its usage — static ESM
 * imports are unconditional. Confirmed the hard way: an earlier version of
 * this file did exactly that, and `grep`-ing an actual `next build` output
 * found the fixture strings sitting in `.next/static/chunks/*.js`.
 *
 * The fix is `tryResolveDevMock()` below: it reaches the fixture resolver
 * only through a `require()` call inside a branch guarded by a literal
 * `process.env.NODE_ENV === "production"` comparison. Next.js inlines
 * `process.env.NODE_ENV` as a build-time string constant, so in a production
 * build this becomes `if (true) return undefined;` followed by dead code —
 * and unlike a static `import`, a `require()` sitting in a provably-dead
 * branch IS excluded by the bundler, because require() resolution happens
 * at the same pass as the dead-code elimination, not before it. Re-verify
 * this empirically after any refactor here — see the grep command in the
 * task that added this file for the exact check.
 *
 * REMOVE WHEN THE REAL BACKEND IS LIVE:
 *   - delete lib/dev/ (this file, mockFetch.ts, fixtures/)
 *   - remove the "DEV MOCK (remove-safe)" fenced block in hooks/useFetch.ts
 *   - remove the "Simulate backend data" section from DevAuthBypassPanel.tsx
 * Nothing else references this feature.
 * ─────────────────────────────────────────────────────────────────────────
 */
const IS_PROD = process.env.NODE_ENV === "production";

const ENABLED_KEY = "bs-dev-mock-enabled";
export const DEV_MOCK_CHANGE_EVENT = "bs-dev-mock-change";

export function isDevMockAvailable(): boolean {
  return !IS_PROD;
}

export function isDevMockEnabled(): boolean {
  if (IS_PROD || typeof window === "undefined") return false;
  return window.localStorage.getItem(ENABLED_KEY) === "true";
}

export function setDevMockEnabled(enabled: boolean) {
  if (IS_PROD || typeof window === "undefined") return;
  window.localStorage.setItem(ENABLED_KEY, String(enabled));
  window.dispatchEvent(new Event(DEV_MOCK_CHANGE_EVENT));
}

/**
 * Resolves `endpoint` against the dev fixtures, or returns `undefined` if
 * mocking is off/unavailable or no fixture matches. The ONLY path by which
 * fixture data can reach the bundle — see the file header for why this has
 * to be a guarded `require()`, not a top-level `import`.
 */
export function tryResolveDevMock<T>(endpoint: string): T | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  if (!isDevMockEnabled()) return undefined;
  // Must be a conditional require, not a static import, so the fixture modules are
  // excluded from the production bundle (see file header). This whole file is
  // deleted when the mock feature is removed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolveMockFetch } = require("./mockFetch") as typeof import("./mockFetch");
  return resolveMockFetch(endpoint) as T | undefined;
}
