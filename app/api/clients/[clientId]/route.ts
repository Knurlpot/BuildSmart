import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type Params = { params: Promise<{ clientId: string }> };
type UpdateClientPayload = {
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

export async function PATCH(request: NextRequest, { params }: Params) {
  const companyId = await companyIdFor(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;
  const id = Number(clientId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid client id." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as UpdateClientPayload | null;
  const clientName = cleanText(body?.client_name);
  if (!clientName) return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  const clientType = body?.client_type === "Returning" ? "Returning" : "New";

  const result = await pool.query(
    `UPDATE client
     SET client_name = $1,
         contact_person = $2,
         contact_email = $3,
         contact_number = $4,
         client_address = $5,
         client_type = $6,
         notes = $7
     WHERE client_id = $8 AND company_id = $9
     RETURNING client_id, company_id, client_name, contact_person, contact_email,
               contact_number, client_address, client_type,
               default_downpayment_percentage::float AS default_downpayment_percentage,
               notes, status, created_at::text AS created_at`,
    [
      clientName,
      cleanText(body?.contact_person),
      cleanText(body?.contact_email),
      cleanText(body?.contact_number),
      cleanText(body?.client_address),
      clientType,
      cleanText(body?.notes),
      id,
      companyId,
    ]
  );
  if (!result.rows[0]) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  return NextResponse.json(result.rows[0]);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const companyId = await companyIdFor(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;
  const id = Number(clientId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid client id." }, { status: 400 });

  const result = await pool.query(
    "DELETE FROM client WHERE client_id = $1 AND company_id = $2 RETURNING client_id",
    [id, companyId]
  );
  if (result.rowCount === 0) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  return NextResponse.json({ deleted: true, client_id: id });
}
