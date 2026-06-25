export interface Users {
  user_ID: number;
  company_ID: number;
  last_name: string;
  first_name: string;
  middle_name?: string;
  email: string;
  // password_hash intentionally omitted — never expose this on the frontend type
  user_role: 'Owner' | 'Admin' | 'Estimator' | 'Viewer';
  status: 'Active' | 'Inactive';
  created_at: string;
}