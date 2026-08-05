export const PH_MOBILE_NATIONAL_LENGTH = 10;

export function normalizePhMobileDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length > PH_MOBILE_NATIONAL_LENGTH) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length > PH_MOBILE_NATIONAL_LENGTH) {
    digits = digits.slice(1);
  }
  return digits.slice(0, PH_MOBILE_NATIONAL_LENGTH);
}

export function formatPhMobileNationalNumber(digits: string): string {
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean).join(" ");
}

export function formatPhMobileE164(raw: string): string {
  const digits = normalizePhMobileDigits(raw);
  return digits ? `+63${digits}` : "";
}

export function isValidPhMobileNumber(raw: string): boolean {
  return /^9\d{9}$/.test(normalizePhMobileDigits(raw));
}
