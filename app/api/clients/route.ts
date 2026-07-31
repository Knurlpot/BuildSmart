import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type ClientRow = {
  client_id: number;
  company_id: number;
  client_name: string;
  contact_person: string | null;
  contact_email: string | null;
  contact_number: string | null;
  client_address: string | null;
  client_type: "New" | "Returning";
  default_downpayment_percentage: number | null;
  notes: string | null;
  status: "Active" | "Inactive";
  created_at: string;
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

export async function GET(request: NextRequest) {
  const companyId = await companyIdFor(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query<ClientRow>(
    `SELECT client_id, company_id, client_name, contact_person, contact_email,
            contact_number, client_address, client_type,
            default_downpayment_percentage::float AS default_downpayment_percentage,
            notes, status, created_at::text AS created_at
     FROM client
     WHERE company_id = $1 AND status = 'Active'
     ORDER BY client_name ASC, client_id ASC`,
    [companyId]
  );

  return NextResponse.json(result.rows);
}
