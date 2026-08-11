import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext } from "../../pricing";
import { pool } from "@/lib/server/db";

const API_BASE = process.env.NEXT_PUBLIC_NORMALIZATION_API_BASE_URL || "http://localhost:8000";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "dxf"]);

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
    return NextResponse.json({ error: "Upload a PDF or DXF blueprint." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Blueprint files must be between 1 byte and 25 MB." }, { status: 400 });
  }

  const outgoing = new FormData();
  outgoing.append("file", file, file.name);
  try {
    const response = await fetch(`${API_BASE}/blueprints/extract/${quoteId}`, { method: "POST", body: outgoing });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json({ error: body?.detail || "Blueprint extraction failed." }, { status: response.status });
    }
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "Blueprint scanner is unavailable. Start the FastAPI service and try again." }, { status: 503 });
  }
}
