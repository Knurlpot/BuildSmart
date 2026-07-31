import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type Params = { params: Promise<{ clientId: string }> };

async function companyIdFor(request: NextRequest) {
  const session = readSession(request);
  if (!session) return null;

  const result = await pool.query<{ company_id: number }>(
    "SELECT company_id FROM users WHERE user_id = $1 LIMIT 1",
    [session.userId]
  );
  return result.rows[0]?.company_id ?? null;
}

export async function GET(request: NextRequest, { params }: Params) {
  const companyId = await companyIdFor(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;
  const id = Number(clientId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid client id." }, { status: 400 });

  const clientResult = await pool.query<{
    client_type: "New" | "Returning";
    default_downpayment_percentage: number | null;
  }>(
    `SELECT client_type, default_downpayment_percentage::float AS default_downpayment_percentage
     FROM client
     WHERE client_id = $1 AND company_id = $2`,
    [id, companyId]
  );
  const client = clientResult.rows[0];
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const quoteResult = await pool.query<{
    project_count: number;
    project_name: string | null;
    created_at: string | null;
  }>(
    `SELECT COUNT(*)::int AS project_count,
            (
              SELECT q2.project_name
              FROM quotation q2
              WHERE q2.client_id = $1 AND q2.company_id = $2
              ORDER BY q2.created_at DESC, q2.quote_id DESC
              LIMIT 1
            ) AS project_name,
            (
              SELECT q2.created_at::text
              FROM quotation q2
              WHERE q2.client_id = $1 AND q2.company_id = $2
              ORDER BY q2.created_at DESC, q2.quote_id DESC
              LIMIT 1
            ) AS created_at
     FROM quotation q
     WHERE q.client_id = $1 AND q.company_id = $2`,
    [id, companyId]
  );
  const summary = quoteResult.rows[0];

  return NextResponse.json({
    hasHistory: (summary?.project_count ?? 0) > 0,
    clientType: (summary?.project_count ?? 0) > 0 ? "Returning" : client.client_type,
    projectCount: summary?.project_count ?? 0,
    mostRecentProject:
      summary?.project_name && summary.created_at
        ? { project_name: summary.project_name, created_at: summary.created_at }
        : null,
    downpaymentOnFile: client.default_downpayment_percentage,
  });
}
