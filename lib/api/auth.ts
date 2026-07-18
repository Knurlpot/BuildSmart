import { apiClient } from "./client";
import type { Users } from "@/types/entities";

export interface AuthUser {
  id: unknown;
  email: string | null;
  companyId: unknown;
  onboardingStep: number;
}

// Wire format (snake_case vs camelCase) UNVERIFIED against the backend — confirm before
// trusting at runtime. Field names below match the schema v3 column names for `users` and
// `company` directly (snake_case) as a starting assumption.
//
// user_role is a user-selectable dropdown on signup (defaulting to 'Owner', since the
// person creating the company usually is its owner, but editable — self-signup can still
// be filling a seat someone else already owns). Schema v3 gives user_role no DEFAULT
// (unlike status, which defaults to 'Active' at the DB level), so something has to supply
// it; this is our best guess at what the register endpoint expects. status (users +
// company) and company_id are never sent — company_id is backend-generated when the
// company row is created and is treated as opaque; status defaults itself at the DB level.
export interface RegisterPayload {
  // -> users
  first_name: string;
  last_name: string;
  middle_name?: string;
  email: string; // the user's LOGIN email — distinct from company.contact_email below
  password: string;
  user_role: Users['user_role'];
  // -> company
  company: {
    company_name: string;
    company_address: string;
    contact_email: string; // the company's own contact email — distinct from the login email above
    contact_number: string;
    specialization_1: string;
    // null (not omitted/empty-string) when the user picked fewer than 3 — see
    // lib/specializations.ts's specializationsToColumns.
    specialization_2: string | null;
    specialization_3: string | null;
    company_logo?: string;
  };
}

export function login(email: string, password: string) {
  return apiClient<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
}

export function register(payload: RegisterPayload) {
  return apiClient<{ user: AuthUser }>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  return apiClient<void>("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}

export function me() {
  return apiClient<AuthUser>("/api/auth/me", { credentials: "include" });
}

export function updateOnboardingStep(step: number) {
  return apiClient<{ onboardingStep: number }>("/api/users/onboarding-step", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ step }),
  });
}
