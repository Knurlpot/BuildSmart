// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Matches Users exactly
// (types/entities/users.ts), same field casing. Backs GET /api/auth/me on the Account
// page — never includes a password field.
import type { Users } from "@/types/entities";

export const userProfileFixture: Users = {
  user_id: 1001,
  company_id: 101,
  first_name: "Marisol",
  last_name: "Reyes",
  middle_name: "Tan",
  email: "marisol.reyes@lakesidebuilders.example",
  user_role: "Owner",
  status: "Active",
  created_at: "2025-03-11T08:00:00.000Z",
};
