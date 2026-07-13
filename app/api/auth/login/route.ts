import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { verifyPassword } from "@/lib/server/password";
import { setSessionCookie } from "@/lib/server/session";
import { toAuthUser, type UserRow } from "@/lib/server/entities";

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as LoginBody;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const result = await pool.query<UserRow>(
    `SELECT user_id, company_id, last_name, first_name, middle_name, email, password, user_role, status, created_at
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email]
  );

  const user = result.rows[0];
  if (!user || !(await verifyPassword(password, user.password))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const response = NextResponse.json({ user: toAuthUser(user, 0) });
  setSessionCookie(response, user.user_id, 0);
  return response;
}