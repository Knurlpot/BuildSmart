import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext } from "../../pricing";
import { pool } from "@/lib/server/db";
import { getNormalizationApiBaseUrl, getNormalizationApiHeaders } from "@/lib/server/config";

type Params = { params: Promise<{ quotationId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const { quotationId } = await params;
  const quoteId = Number(quotationId);
  if (!Number.isInteger(quoteId)) return NextResponse.json({ error: "Invalid quotation id." }, { status: 400 });

  const quote = await pool.query<{ blueprint_file_path: string | null }>(
    "SELECT blueprint_file_path FROM quotation WHERE quote_id = $1 AND company_id = $2 LIMIT 1",
    [quoteId, auth.companyId],
  );
  const savedPath = quote.rows[0]?.blueprint_file_path;
  if (!quote.rows[0]) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
  if (!savedPath) {
    return NextResponse.json(
      { error: "This blueprint was not saved. Upload and scan it after storage is configured." },
      { status: 409 },
    );
  }
  if (!savedPath.toLowerCase().endsWith(".dxf")) {
    return NextResponse.json({ error: "Saved PDF blueprints can no longer be rescanned. Upload a DXF blueprint." }, { status: 400 });
  }

  try {
    const apiBase = getNormalizationApiBaseUrl();
    const response = await fetch(`${apiBase}/blueprints/rescan/${quoteId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getNormalizationApiHeaders() },
      body: JSON.stringify({ blueprint_file_path: savedPath }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("Blueprint rescan service failed", body);
      return NextResponse.json({ error: "Blueprint rescan failed." }, { status: response.status });
    }
    await pool.query("UPDATE quotation SET updated_by_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE quote_id = $2 AND company_id = $3", [
      auth.userId,
      quoteId,
      auth.companyId,
    ]);
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "Blueprint scanner is unavailable. Start the FastAPI service and try again." }, { status: 503 });
  }
}
