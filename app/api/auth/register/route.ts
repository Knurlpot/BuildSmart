import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/password";
import { setSessionCookie } from "@/lib/server/session";
import { toAuthUser, type CompanyRow, type UserRow } from "@/lib/server/entities";

type RegisterBody = {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  email?: string;
  password?: string;
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

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RegisterBody;
  const firstName = body.first_name?.trim() || "";
  const lastName = body.last_name?.trim() || "";
  const middleName = body.middle_name?.trim() || null;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const company = body.company;

  if (
    !firstName ||
    !lastName ||
    !email ||
    !password ||
    !company?.company_name ||
    !company.company_address ||
    !company.contact_email ||
    !company.contact_number ||
    !company.specialization_1
  ) {
    return NextResponse.json({ error: "Missing required registration fields" }, { status: 400 });
  }

  const hashedPassword = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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
        company.company_name,
        company.company_address,
        company.contact_email.toLowerCase(),
        company.contact_number,
        company.specialization_1,
        company.specialization_2 || null,
        company.specialization_3 || null,
        company.company_logo || null,
      ]
    );

    const companyId = companyResult.rows[0].company_id;
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
      [companyId, lastName, firstName, middleName, email, hashedPassword, "Owner", "Active"]
    );

    await client.query("COMMIT");

    const response = NextResponse.json({ user: toAuthUser(userResult.rows[0], 0) }, { status: 201 });
    setSessionCookie(response, userResult.rows[0].user_id, 0);
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    client.release();
  }
}