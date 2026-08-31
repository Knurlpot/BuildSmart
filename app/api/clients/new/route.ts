import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type NewClientPayload = {
  client_name?: string;
  contact_person?: string | null;
  contact_email?: string | null;
  contact_number?: string | null;
  client_address?: string | null;
  client_type?: "New" | "Returning";
  notes?: string | null;
};

async function companyIdFor(request: NextRequest) {
  const session = readSession(request);
  if (!session) return null;

  const result = await pool.query<{ company_id: number }>(
    "SELECT company_id FROM users WHERE user_id = $1 LIMIT 1",
    [session.userId]
  );
  return result.rows[0]?.company_id ?? null;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const companyId = await companyIdFor(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as NewClientPayload | null;
  const clientName = cleanText(body?.client_name);
  if (!clientName) return NextResponse.json({ error: "Client name is required." }, { status: 400 });

  const result = await pool.query(
    `INSERT INTO client (
       company_id, client_name, contact_person, contact_email, contact_number,
       client_address, client_type, notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'New', $7)
     RETURNING client_id, company_id, client_name, contact_person, contact_email,
               contact_number, client_address, client_type,
               notes, status, created_at::text AS created_at`,
    [
      companyId,
      clientName,
      cleanText(body?.contact_person),
      cleanText(body?.contact_email),
      cleanText(body?.contact_number),
      cleanText(body?.client_address),
      cleanText(body?.notes),
    ]
  );

  return NextResponse.json(result.rows[0], { status: 201 });
}
