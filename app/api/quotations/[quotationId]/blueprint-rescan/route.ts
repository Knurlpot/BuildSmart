import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext } from "../../pricing";
import { pool } from "@/lib/server/db";

const API_BASE = process.env.NEXT_PUBLIC_NORMALIZATION_API_BASE_URL || "http://localhost:8000";

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

  try {
    const response = await fetch(`${API_BASE}/blueprints/rescan/${quoteId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blueprint_file_path: savedPath }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json({ error: body?.detail || "Blueprint rescan failed." }, { status: response.status });
    }
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "Blueprint scanner is unavailable. Start the FastAPI service and try again." }, { status: 503 });
  }
}
