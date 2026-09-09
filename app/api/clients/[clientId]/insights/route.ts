import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type Params = { params: Promise<{ clientId: string }> };

async function authFor(request: NextRequest) {
  const session = readSession(request);
  if (!session) return null;

  const result = await pool.query<{ company_id: number }>(
    "SELECT company_id FROM users WHERE user_id = $1 LIMIT 1",
    [session.userId]
  );
  const companyId = result.rows[0]?.company_id ?? null;
  return companyId ? { companyId, userId: session.userId } : null;
}

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await authFor(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;
  const id = Number(clientId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid client id." }, { status: 400 });

  const clientResult = await pool.query<{
    client_type: "New" | "Returning";
  }>(
    `SELECT client_type
     FROM client
     WHERE client_id = $1 AND company_id = $2`,
    [id, auth.companyId]
  );
  const client = clientResult.rows[0];
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const quoteResult = await pool.query<{
    quote_id: number;
    project_name: string;
    project_region: string;
    status: string;
    accepted_tier: "Practical" | "Premium" | null;
    grand_total: number;
    created_at: string;
    updated_at: string;
    updated_by_user_name: string | null;
    updated_by_user_email: string | null;
    made_by_user_id: number;
    made_by_user_name: string | null;
    made_by_user_email: string | null;
  }>(
    `SELECT q.quote_id,
            q.project_name,
            q.project_region,
            q.status::text AS status,
            q.accepted_tier,
            q.grand_total::float8 AS grand_total,
            q.created_at::text AS created_at,
            q.updated_at::text AS updated_at,
            NULLIF(trim(concat_ws(' ', updater.first_name, updater.last_name)), '') AS updated_by_user_name,
            updater.email AS updated_by_user_email,
            q.user_id AS made_by_user_id,
            NULLIF(trim(concat_ws(' ', creator.first_name, creator.last_name)), '') AS made_by_user_name,
            creator.email AS made_by_user_email
     FROM quotation q
     LEFT JOIN users updater ON updater.user_id = COALESCE(q.updated_by_user_id, q.user_id)
     LEFT JOIN users creator ON creator.user_id = q.user_id
     WHERE q.client_id = $1 AND q.company_id = $2`,
    [id, auth.companyId]
  );
  const projects = quoteResult.rows.sort((a, b) => {
    const dateSort = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    return dateSort !== 0 ? dateSort : b.quote_id - a.quote_id;
  });
  const projectCount = projects.length;

  return NextResponse.json({
    hasHistory: projectCount > 0,
    clientType: projectCount > 0 ? "Returning" : "New",
    projectCount,
    projects,
    mostRecentProject: projects[0] ?? null,
  });
}
