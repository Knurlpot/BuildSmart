import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/server/session";
import { pool } from "@/lib/server/db";
import { imageLocation } from "@/lib/server/image-storage";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string; ownerId: string; file: string }> }) {
  const session = readSession(request);
  if (!session) return new NextResponse(null, { status: 401 });
  try {
    const { kind, ownerId, file } = await params;
    const location = imageLocation(kind, ownerId, file);
    if (!location) return new NextResponse(null, { status: 404 });
    const users = await pool.query<{ company_id: number }>("SELECT company_id FROM users WHERE user_id = $1", [session.userId]);
    const companyId = users.rows[0]?.company_id;
    if (!companyId) return new NextResponse(null, { status: 403 });
    if (kind === "company-logos") {
      if (String(companyId) !== ownerId) return new NextResponse(null, { status: 404 });
    } else {
      const owners = await pool.query("SELECT user_id FROM users WHERE user_id = $1 AND company_id = $2", [ownerId, companyId]);
      if (!owners.rows.length) return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(new Uint8Array(await readFile(location)), { headers: {
      "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg",
      "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new NextResponse(null, { status: 404 });
    console.error("Image retrieval failed", error);
    return new NextResponse(null, { status: 500 });
  }
}
