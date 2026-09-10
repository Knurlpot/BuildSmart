import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";

type LookupBody = {
  code?: string;
};

type InviteCompanyRow = {
  company_id: number;
  company_name: string;
  company_address: string;
  contact_email: string;
  contact_number: string;
  specialization_1: string | null;
  specialization_2: string | null;
  specialization_3: string | null;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as LookupBody;
  const code = body.code?.trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: "Enter an invite code" }, { status: 400 });
  }

  const result = await pool.query<InviteCompanyRow>(
    `SELECT c.company_id,
            c.company_name,
            c.company_address,
            c.contact_email,
            c.contact_number,
            c.specialization_1,
            c.specialization_2,
            c.specialization_3
       FROM company_invites ci
       JOIN company c ON c.company_id = ci.company_id
      WHERE ci.code = $1
        AND ci.is_active = TRUE
        AND (ci.expires_at IS NULL OR ci.expires_at > NOW())
        AND ci.used_count < ci.max_uses
        AND c.status = 'Active'
      LIMIT 1`,
    [code]
  );

  const company = result.rows[0];
  if (!company) {
    return NextResponse.json({ error: "Invite code is invalid or has expired" }, { status: 400 });
  }

  return NextResponse.json({
    company: {
      company_id: company.company_id,
      company_name: company.company_name,
      company_address: company.company_address,
      contact_email: company.contact_email,
      contact_number: company.contact_number,
      specializations: [
        company.specialization_1,
        company.specialization_2,
        company.specialization_3,
      ].filter(Boolean),
    },
  });
}
