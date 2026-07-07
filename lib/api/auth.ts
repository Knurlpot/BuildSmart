import { apiClient } from "./client";

export interface AuthUser {
  id: unknown;
  email: string | null;
  companyId: unknown;
  onboardingStep: number;
}

export interface RegisterPayload {
  email: string;
  password: string;
  company: {
    name: string;
    company_address: string;
    contact_number: string;
    city: string;
    region: string;
    project_sector: string[];
    company_role: string;
    specialization: string[];
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
