// PROVISIONAL — shape pending backend schema decision, do not treat as final.
// Small shared client-side validators for the CPRM forms' "System validates rule" step.
export function isPercent(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

export function isPositiveNumber(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

export function isNonEmpty(s: string): boolean {
  return s.trim().length > 0;
}

// Part F — SOFT warnings only (never block save; a contractor may have real reasons for
// an unusual number). Ranges given directly by the task: private-sector OCM 10-15%,
// profit 5-7%; DPWH (government) profit 8-10%. Markup/contingency have no cited official
// range, so those two use broad sanity bounds rather than a fabricated "official" figure.
export function warnMarkup(pct: number): string | null {
  if (pct < 1) return 'Below 1% is unusually low for a markup — double check this value.';
  if (pct > 50) return 'Above 50% is unusually high for a markup — double check this value.';
  return null;
}

export function warnContingency(pct: number): string | null {
  if (pct > 20) return 'Above 20% is unusually high for a contingency allowance — double check this value.';
  return null;
}

export function warnOverhead(pct: number): string | null {
  if (pct < 10 || pct > 15) return 'Outside the typical 10–15% range for private-sector overhead (OCM).';
  return null;
}

export function warnProfitMargin(pct: number): string | null {
  if (pct < 5) return 'Below the typical 5–7% (private) / 8–10% (DPWH) range for profit margin.';
  if (pct > 10) return 'Above the typical 5–7% (private) / 8–10% (DPWH) range for profit margin.';
  return null;
}

export function warnVat(pct: number): string | null {
  if (pct !== 12) return 'Philippine standard VAT is 12% — a different rate is unusual, confirm before saving.';
  return null;
}
