export function isNonEmpty(value: string) {
  return value.trim().length > 0;
}

export function isPositiveNumber(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function isPercent(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function warnOutsideRange(value: number, min: number, max: number, message: string) {
  return value < min || value > max ? message : null;
}

export function warnMarkup(value: number) {
  return warnOutsideRange(value, 5, 30, "That markup is outside the usual working range for most contractor quotes.");
}

export function warnContingency(value: number) {
  return warnOutsideRange(value, 0, 15, "That contingency looks unusual; double-check the project risk profile.");
}

export function warnOverhead(value: number) {
  return warnOutsideRange(value, 5, 20, "That overhead is outside the range most firms use for OCM recovery.");
}

export function warnProfitMargin(value: number) {
  return warnOutsideRange(value, 5, 25, "That profit margin is unusual for a standard competitive quotation.");
}

export function warnVat(value: number) {
  return value !== 12 ? "Philippine VAT is usually 12%; confirm this exception before sending the quote." : null;
}