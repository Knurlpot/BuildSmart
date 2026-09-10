import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/password";
import { setSessionCookie } from "@/lib/server/session";
import { toAuthUser, type CompanyRow, type UserRow } from "@/lib/server/entities";
import { resolvePersistedOnboardingStep } from "@/lib/server/onboarding";

type RegisterBody = {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  email?: string;
  password?: string;
  user_role?: string;
  role?: string;
  invite_code?: string;
  company_id?: number;
  company?: {
    company_name?: string;
    company_address?: string;
    contact_email?: string;
    contact_number?: string;
    specialization_1?: string;
    specialization_2?: string;
    specialization_3?: string;
    company_logo?: string;
  };
};

function isPgUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "constraint" in error &&
    (error as { code?: unknown; constraint?: unknown }).code === "23505" &&
    (error as { code?: unknown; constraint?: unknown }).constraint === constraint
  );
}

class DuplicateEmailError extends Error {
  constructor() {
    super("An account with this email already exists. Please sign in instead.");
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RegisterBody;
  const firstName = body.first_name?.trim() || "";
  const lastName = body.last_name?.trim() || "";
  const middleName = body.middle_name?.trim() || null;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const inviteCode = body.invite_code?.trim().toUpperCase() || "";
  const requestedCompanyId = Number(body.company_id);
  const companyIdFromLegacyPayload = Number.isInteger(requestedCompanyId) && requestedCompanyId > 0 ? requestedCompanyId : null;
  const company = body.company;
  const isJoiningCompany = Boolean(inviteCode || companyIdFromLegacyPayload);
  const userRole = isJoiningCompany ? "Estimator" : "Owner";

  if (
    !firstName ||
    !lastName ||
    !email ||
    !password
  ) {
    return NextResponse.json({ error: "Missing required registration fields" }, { status: 400 });
  }

  if (
    !isJoiningCompany &&
    (!company?.company_name ||
      !company.company_address ||
      !company.contact_email ||
      !company.contact_number ||
      !company.specialization_1)
  ) {
    return NextResponse.json({ error: "Missing required company fields" }, { status: 400 });
  }

  const hashedPassword = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingUser = await client.query<{ user_id: number; company_id: number; status: "Active" | "Inactive" }>(
      "SELECT user_id, company_id, status FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    const existingUserRow = existingUser.rows[0];
    if (existingUserRow?.status === "Active") {
      throw new DuplicateEmailError();
    }
    if (existingUserRow?.status === "Inactive") {
      await client.query("DELETE FROM price_list_review_item WHERE company_id = $1", [existingUserRow.company_id]);
      await client.query("DELETE FROM items WHERE company_id = $1", [existingUserRow.company_id]);
      await client.query("DELETE FROM quotation WHERE company_id = $1", [existingUserRow.company_id]);
      await client.query("DELETE FROM company WHERE company_id = $1", [existingUserRow.company_id]);
    }

    let companyId = companyIdFromLegacyPayload;
    if (inviteCode) {
      const inviteResult = await client.query<{
        invite_id: number;
        company_id: number;
        role: "Estimator";
        max_uses: number;
        used_count: number;
      }>(
        `SELECT invite_id, company_id, role, max_uses, used_count
           FROM company_invites
          WHERE code = $1
            AND is_active = TRUE
            AND (expires_at IS NULL OR expires_at > NOW())
            AND used_count < max_uses
          LIMIT 1
          FOR UPDATE`,
        [inviteCode]
      );
      const invite = inviteResult.rows[0];
      if (!invite) {
        throw new Error("Invite code is invalid or has expired");
      }
      companyId = invite.company_id;
      await client.query(
        `UPDATE company_invites
            SET used_count = used_count + 1,
                is_active = CASE WHEN used_count + 1 >= max_uses THEN FALSE ELSE is_active END
          WHERE invite_id = $1`,
        [invite.invite_id]
      );
    }

    if (companyId) {
      const existingCompany = await client.query<CompanyRow>(
        `SELECT * FROM company WHERE company_id = $1 AND status = 'Active' LIMIT 1`,
        [companyId]
      );
      if (!existingCompany.rows[0]) {
        throw new Error("Company not found");
      }
    } else {
      const companyResult = await client.query<CompanyRow>(
        `INSERT INTO company (
          company_name,
          company_address,
          contact_email,
          contact_number,
          specialization_1,
          specialization_2,
          specialization_3,
          company_logo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          company!.company_name,
          company!.company_address,
          company!.contact_email!.toLowerCase(),
          company!.contact_number,
          company!.specialization_1,
          company!.specialization_2 || null,
          company!.specialization_3 || null,
          company!.company_logo || null,
        ]
      );
      companyId = companyResult.rows[0].company_id;
    }

    const userResult = await client.query<UserRow>(
      `INSERT INTO users (
        company_id,
        last_name,
        first_name,
        middle_name,
        email,
        password,
        user_role,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [companyId, lastName, firstName, middleName, email, hashedPassword, userRole, "Active"]
    );

    await client.query("COMMIT");

    const onboardingStep = await resolvePersistedOnboardingStep(companyId);
    const response = NextResponse.json({ user: toAuthUser(userResult.rows[0], onboardingStep) }, { status: 201 });
    setSessionCookie(response, userResult.rows[0].user_id, onboardingStep);
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof DuplicateEmailError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (isPgUniqueViolation(error, "users_email_key")) {
      return NextResponse.json({ error: "An account with this email already exists. Please sign in instead." }, { status: 409 });
    }
    console.error("Registration failed", error);
    return NextResponse.json({ error: "Registration failed. Please check your information and try again." }, { status: 400 });
  } finally {
    client.release();
  }
}
