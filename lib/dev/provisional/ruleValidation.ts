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
