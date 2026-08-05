// Shared dual-mode routing logic for the public/authenticated About Us page
// (app/(marketing)/about/page.tsx) — the ONE place that decides where a feature mention
// or nav link goes, used identically by FeatureGrid, SidebarPeek, and the page's own
// Hero/CTABand CTAs so there's exactly one behavior to reason about, not one per component.
//
// Reuses the REAL onboarding resolver (lib/onboarding.ts) rather than re-deriving its
// logic — a logged-in user hitting a still-gated module lands exactly where
// RequireOnboardingStep would have sent them, without importing that (blocking,
// render-guard) component itself.
import { resolveOnboardingRoute } from './onboarding';
import type { AuthUser } from './api/auth';
import type { NavItem } from '@/components/layout/nav-items';

/**
 * Where a feature/module link should point, given the current auth state.
 * - Logged out: always /signup — a visitor must never be dead-ended at a bare login wall.
 * - Logged in, module unlocked: the real module route.
 * - Logged in, module still gated by onboarding: routed through the same resolver
 *   RequireOnboardingStep uses, so the user lands on the setup step that actually unlocks it.
 */
export function resolveFeatureHref(item: Pick<NavItem, 'href' | 'minStep'>, isAuthenticated: boolean, currentUser: AuthUser | null): string {
  if (!isAuthenticated || !currentUser) return '/signup';
  const step = currentUser.onboardingStep;
  return step >= item.minStep ? item.href : resolveOnboardingRoute(step);
}

/** Where the page's primary "Get Started" / "Go to Dashboard" CTA points. */
export function resolvePrimaryCta(isAuthenticated: boolean, currentUser: AuthUser | null): string {
  if (!isAuthenticated || !currentUser) return '/signup';
  return resolveOnboardingRoute(currentUser.onboardingStep);
}
