import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { clearSessionCookie, readSession } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    `UPDATE users
     SET status = 'Inactive',
         failed_login_attempts = 0,
         locked_until = NULL
     WHERE user_id = $1
       AND status = 'Active'
     RETURNING user_id`,
    [session.userId]
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Account not found or already inactive." }, { status: 404 });
  }

  const response = NextResponse.json({ deactivated: true });
  clearSessionCookie(response);
  return response;
}
