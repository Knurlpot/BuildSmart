export type CompanyRow = {
  company_id: number;
  company_name: string;
  company_address: string;
  contact_email: string;
  contact_number: string;
  specialization_1: string;
  specialization_2: string | null;
  specialization_3: string | null;
  company_logo: string | null;
  status: "Active" | "Inactive";
  created_at: string;
};

export type UserRow = {
  user_id: number;
  company_id: number;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  email: string;
  password: string;
  user_role: "Owner" | "Admin" | "Estimator" | "Viewer";
  status: "Active" | "Inactive";
  created_at: string;
};

export type AuthUser = {
  id: number;
  companyId: number;
  onboardingStep: number;
} & Omit<UserRow, "user_id" | "company_id" | "password"> & {
  user_id: number;
  company_id: number;
};

export function toAuthUser(row: UserRow, onboardingStep = 0): AuthUser {
  return {
    id: row.user_id,
    user_id: row.user_id,
    companyId: row.company_id,
    company_id: row.company_id,
    onboardingStep,
    last_name: row.last_name,
    first_name: row.first_name,
    middle_name: row.middle_name,
    email: row.email,
    user_role: row.user_role,
    status: row.status,
    created_at: row.created_at,
  };
}