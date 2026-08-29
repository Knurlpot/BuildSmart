import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import {
  cleanText,
  companyIdFor,
  missingRequiredFields,
  validClientType,
  type DetectedClientColumn,
  type ExtractedClientRow,
} from "../shared";

type CommitPayload = {
  columns?: DetectedClientColumn[];
  rows?: ExtractedClientRow[];
};

function rowError(row: ExtractedClientRow) {
  if (!cleanText(row.client_name)) return "Client Name is required.";
  if (!cleanText(row.contact_person)) return "Contact Person is required.";
  if (!cleanText(row.contact_number)) return "Contact Number is required.";
  if (!cleanText(row.client_address)) return "Client Address is required.";
  return null;
}

export async function POST(request: NextRequest) {
  const companyId = await companyIdFor(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as CommitPayload | null;
  const columns = body?.columns ?? [];
  const rows = body?.rows ?? [];
  if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No client rows to import." }, { status: 400 });
  }

  const missing = missingRequiredFields(columns);
  if (missing.length > 0) {
    return NextResponse.json({ error: "Map Client Name, Contact Person, Contact Number, and Client Address before importing." }, { status: 400 });
  }

  const firstInvalid = rows.find((row) => rowError(row));
  if (firstInvalid) return NextResponse.json({ error: rowError(firstInvalid) }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let savedCount = 0;
    for (const row of rows) {
      await client.query(
        `INSERT INTO client (
           company_id, client_name, contact_person, contact_email, contact_number,
           client_address, client_type, default_downpayment_percentage, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Returning'), NULL, $8)`,
        [
          companyId,
          cleanText(row.client_name),
          cleanText(row.contact_person),
          cleanText(row.contact_email),
          cleanText(row.contact_number),
          cleanText(row.client_address),
          validClientType(row.client_type),
          cleanText(row.notes),
        ]
      );
      savedCount += 1;
    }
    await client.query("COMMIT");
    return NextResponse.json({ saved_count: savedCount }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import clients." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
