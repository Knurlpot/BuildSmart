import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";
import { type CompanyRow } from "@/lib/server/entities";

type Body = Partial<CompanyRow>;

async function assertOwnCompany(request: NextRequest, requestedCompanyId: number) {
  const session = readSession(request);
  if (!session) return null;

  const result = await pool.query<{ company_id: number }>(
    `SELECT company_id FROM users WHERE user_id = $1 LIMIT 1`,
    [session.userId]
  );

  const currentCompanyId = result.rows[0]?.company_id;
  if (currentCompanyId !== requestedCompanyId) return null;
  return session.userId;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (Number.isNaN(companyId)) {
    return NextResponse.json({ error: "Invalid company id" }, { status: 400 });
  }

  const userId = await assertOwnCompany(request, companyId);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pool.query<CompanyRow>(
    `SELECT company_id, company_name, company_address, contact_email, contact_number, company_role, specialization_1, specialization_2, specialization_3, company_logo, status, created_at
     FROM company
     WHERE company_id = $1
     LIMIT 1`,
    [companyId]
  );

  const company = result.rows[0];
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  return NextResponse.json(company);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (Number.isNaN(companyId)) {
    return NextResponse.json({ error: "Invalid company id" }, { status: 400 });
  }

  const userId = await assertOwnCompany(request, companyId);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const result = await pool.query<CompanyRow>(
    `UPDATE company
     SET company_name = COALESCE($1, company_name),
         company_address = COALESCE($2, company_address),
         contact_email = COALESCE($3, contact_email),
         contact_number = COALESCE($4, contact_number),
         company_role = COALESCE($5, company_role),
         specialization_1 = COALESCE($6, specialization_1),
         specialization_2 = $7,
         specialization_3 = $8,
         company_logo = $9,
         status = COALESCE($10, status)
     WHERE company_id = $11
     RETURNING company_id, company_name, company_address, contact_email, contact_number, company_role, specialization_1, specialization_2, specialization_3, company_logo, status, created_at`,
    [
      body.company_name ?? null,
      body.company_address ?? null,
      body.contact_email ?? null,
      body.contact_number ?? null,
      body.company_role ?? null,
      body.specialization_1 ?? null,
      body.specialization_2 ?? null,
      body.specialization_3 ?? null,
      body.company_logo ?? null,
      body.status ?? null,
      companyId,
    ]
  );

  const company = result.rows[0];
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  return NextResponse.json(company);
}