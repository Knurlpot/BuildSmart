import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";

type CheckCompanyBody = {
  query?: string;
};

type CompanyLookupRow = {
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
  const body = (await request.json().catch(() => ({}))) as CheckCompanyBody;
  const query = body.query?.trim();

  if (!query) {
    return NextResponse.json({ error: "Enter a company email" }, { status: 400 });
  }

  if (!query.includes("@")) {
    return NextResponse.json({ error: "Enter a valid company email" }, { status: 400 });
  }

  const result = await pool.query<CompanyLookupRow>(
    `SELECT company_id, company_name, company_address, contact_email, contact_number,
            specialization_1, specialization_2, specialization_3
       FROM company
      WHERE status = 'Active'
        AND lower(contact_email) = lower($1)
      LIMIT 1`,
    [query]
  );

  const company = result.rows[0];
  if (!company) {
    return NextResponse.json({ company: null });
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
