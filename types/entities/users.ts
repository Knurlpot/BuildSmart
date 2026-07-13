// Mirrors users in the authoritative SQL. Wire format (snake_case vs camelCase)
// UNVERIFIED against the backend — confirm before trusting at runtime.
export interface Users {
  user_id: number;
  company_id: number;
  last_name: string;
  first_name: string;
  middle_name?: string;
  email: string;
  // password intentionally omitted — never expose this on the frontend type
  user_role: 'Owner' | 'Admin' | 'Estimator' | 'Viewer';
  status: 'Active' | 'Inactive';
  created_at: string;
}

export const USER_ROLES: Users['user_role'][] = ['Owner', 'Admin', 'Estimator', 'Viewer'];