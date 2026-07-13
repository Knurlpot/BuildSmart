import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";
import { toAuthUser, type UserRow } from "@/lib/server/entities";

type Body = Partial<Pick<UserRow, "last_name" | "first_name" | "middle_name" | "email" | "user_role" | "status">>;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUserId = readSession(request)?.userId;
  const { id } = await params;
  const requestedId = Number(id);
  if (!currentUserId || Number.isNaN(requestedId) || requestedId !== currentUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pool.query<UserRow>(
    `SELECT user_id, company_id, last_name, first_name, middle_name, email, password, user_role, status, created_at
     FROM users
     WHERE user_id = $1
     LIMIT 1`,
    [requestedId]
  );

  const user = result.rows[0];
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(toAuthUser(user, 0));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUserId = readSession(request)?.userId;
  const { id } = await params;
  const requestedId = Number(id);
  if (!currentUserId || Number.isNaN(requestedId) || requestedId !== currentUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const result = await pool.query<UserRow>(
    `UPDATE users
     SET last_name = COALESCE($1, last_name),
         first_name = COALESCE($2, first_name),
         middle_name = $3,
         email = COALESCE($4, email),
         user_role = COALESCE($5, user_role),
         status = COALESCE($6, status)
     WHERE user_id = $7
     RETURNING user_id, company_id, last_name, first_name, middle_name, email, password, user_role, status, created_at`,
    [
      body.last_name ?? null,
      body.first_name ?? null,
      body.middle_name ?? null,
      body.email?.toLowerCase() ?? null,
      body.user_role ?? null,
      body.status ?? null,
      requestedId,
    ]
  );

  const user = result.rows[0];
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(toAuthUser(user, 0));
}