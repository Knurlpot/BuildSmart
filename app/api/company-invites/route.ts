import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type InviteRow = {
  invite_id: number;
  company_id: number;
  code: string;
  role: "Estimator";
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `BS-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userResult = await pool.query<{ user_id: number; company_id: number; user_role: string }>(
    `SELECT user_id, company_id, user_role
       FROM users
      WHERE user_id = $1
      LIMIT 1`,
    [session.userId]
  );
  const user = userResult.rows[0];
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.user_role !== "Owner") {
    return NextResponse.json({ error: "Only company owners can generate invite codes." }, { status: 403 });
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    try {
      const inviteResult = await pool.query<InviteRow>(
        `INSERT INTO company_invites (
          company_id,
          code,
          role,
          created_by,
          expires_at
        ) VALUES ($1, $2, 'Estimator', $3, NOW() + INTERVAL '1 day')
        RETURNING invite_id, company_id, code, role, max_uses, used_count, expires_at, is_active, created_at`,
        [user.company_id, code, user.user_id]
      );

      return NextResponse.json({ invite: inviteResult.rows[0] }, { status: 201 });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "23505"
      ) {
        continue;
      }
      console.error("Failed to generate invite code", error);
      return NextResponse.json({ error: "Failed to generate invite code" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Could not generate a unique invite code. Please try again." }, { status: 500 });
}
