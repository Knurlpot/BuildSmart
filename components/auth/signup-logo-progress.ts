type SignupLogoFields = {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  password: string;
  confirmPassword: string;
  inviteCode: string;
  companyName: string;
  companyAddress: string;
  companyContactEmail: string;
  companyContactNumber: string;
  specializations: string[];
};

/** Decorative engagement only, never a replacement for form validation. */
export function signupLogoStage(form: SignupLogoFields, mode: "join" | "create", termsAccepted: boolean): number {
  const fields = [form.firstName, form.lastName, form.email, form.password, form.confirmPassword];
  if (mode === "join") fields.push(form.inviteCode);
  else fields.push(form.companyName, form.companyAddress, form.companyContactEmail, form.companyContactNumber);
  // Optional middle name can add progress, but leaving it blank cannot block completion.
  if (form.middleName.trim()) fields.push(form.middleName);
  const checks = fields.map(value => value.trim().length > 0);
  if (mode === "create") checks.push(form.specializations.length > 0);
  checks.push(termsAccepted);
  return Math.round(13 * checks.filter(Boolean).length / checks.length);
}
