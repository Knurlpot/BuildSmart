// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Backs POST /api/pricelist/check-version.
// Matches VersionCheckResponse exactly (hooks/usePricelistPublishedSource.ts).
//
// DPWH -> 'new_available' and PSA -> 'up_to_date' so both branches of the halt-and-branch
// flow are reviewable without toggling anything extra: DPWH still walks into the existing
// deviation-review table, PSA shows the "you're current" message before its index view.
import type { VersionCheckResponse } from "@/hooks/usePricelistPublishedSource";

export const dpwhVersionStatusFixture: VersionCheckResponse = {
  status: "new_available",
  release_label: "2nd Sem 2025",
};

export const psaVersionStatusFixture: VersionCheckResponse = {
  status: "up_to_date",
  release_label: "May 2026",
};
