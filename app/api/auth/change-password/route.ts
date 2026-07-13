import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { readSession } from "@/lib/server/session";
import { type UserRow } from "@/lib/server/entities";

type Body = {
  currentPassword?: string;
  newPassword?: string;
};

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Current and new password are required" }, { status: 400 });
  }

  const result = await pool.query<UserRow>(
    `SELECT user_id, company_id, last_name, first_name, middle_name, email, password, user_role, status, created_at
     FROM users
     WHERE user_id = $1
     LIMIT 1`,
    [session.userId]
  );

  const user = result.rows[0];
  if (!user || !(await verifyPassword(currentPassword, user.password))) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  const nextHash = await hashPassword(newPassword);
  await pool.query(`UPDATE users SET password = $1 WHERE user_id = $2`, [nextHash, session.userId]);
  return new NextResponse(null, { status: 204 });
}