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
  notes: string | null;
  status: "Active" | "Inactive";
  created_at: string;
  quotation_project_count: number;
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
    `SELECT c.client_id, c.company_id, c.client_name, c.contact_person, c.contact_email,
            c.contact_number, c.client_address,
            CASE WHEN quote_counts.project_count > 0 THEN 'Returning' ELSE 'New' END AS client_type,
            c.notes, c.status, c.created_at::text AS created_at,
            quote_counts.project_count AS quotation_project_count
     FROM client c
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS project_count
       FROM quotation q
       WHERE q.client_id = c.client_id AND q.company_id = c.company_id
     ) quote_counts ON TRUE
     WHERE c.company_id = $1 AND c.status = 'Active'
     ORDER BY c.client_name ASC, c.client_id ASC`,
    [companyId]
  );

  return NextResponse.json(result.rows);
}
