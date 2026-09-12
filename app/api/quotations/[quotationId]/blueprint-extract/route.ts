import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext } from "../../pricing";
import { pool } from "@/lib/server/db";
import { linkBlueprintToQuotation } from "@/lib/server/blueprintPersistence.mjs";
import { getNormalizationApiBaseUrl, getNormalizationApiHeaders } from "@/lib/server/config";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["dxf"]);

type Params = { params: Promise<{ quotationId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const { quotationId } = await params;
  const quoteId = Number(quotationId);
  if (!Number.isInteger(quoteId)) return NextResponse.json({ error: "Invalid quotation id." }, { status: 400 });

  const quote = await pool.query("SELECT quote_id FROM quotation WHERE quote_id = $1 AND company_id = $2 LIMIT 1", [
    quoteId,
    auth.companyId,
  ]);
  if (!quote.rows[0]) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });

  const incoming = await request.formData().catch(() => null);
  const file = incoming?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Blueprint file is required." }, { status: 400 });

  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json({ error: "Upload a DXF blueprint." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Blueprint files must be between 1 byte and 25 MB." }, { status: 400 });
  }

  const outgoing = new FormData();
  outgoing.append("file", file, file.name);
  try {
    const apiBase = getNormalizationApiBaseUrl();
    const response = await fetch(`${apiBase}/blueprints/extract/${quoteId}`, {
      method: "POST",
      headers: getNormalizationApiHeaders(),
      body: outgoing,
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("Blueprint extraction service failed", body);
      return NextResponse.json({ error: "Blueprint extraction failed." }, { status: response.status });
    }
    if (body?.blueprint_file_path) {
      try {
        await linkBlueprintToQuotation(pool, body.blueprint_file_path, quoteId, auth.companyId);
        await pool.query("UPDATE quotation SET updated_by_user_id = $1 WHERE quote_id = $2 AND company_id = $3", [
          auth.userId,
          quoteId,
          auth.companyId,
        ]);
      } catch {
        body.blueprint_file_path = null;
        body.persistence_warning = "The scan completed, but its saved file could not be linked to this quotation.";
      }
    }
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Blueprint scanner is unavailable. Start the FastAPI service and try again." }, { status: 503 });
  }
}
