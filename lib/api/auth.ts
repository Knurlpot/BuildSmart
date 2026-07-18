import { apiClient } from "./client";
import type { Users } from "@/types/entities";

export interface AuthUser {
  id: unknown;
  email: string | null;
  companyId: unknown;
  onboardingStep: number;
}

export interface RegisterPayload {
  // users
  first_name: string;
  last_name: string;
  middle_name?: string;
  email: string; 
  password: string;
  user_role: Users['user_role'];
  // company
  company: {
    company_name: string;
    company_address: string;
    contact_email: string; 
    specialization_1: string;
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