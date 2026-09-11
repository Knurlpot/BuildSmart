import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/server/session";
import { pool } from "@/lib/server/db";
import { ImageUploadError, storeImage } from "@/lib/server/image-upload";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = readSession(request);
    if (!session) return NextResponse.json({ error: "Please sign in to upload an image." }, { status: 401 });
    const result = await pool.query<{ user_role: string; company_id: number | null }>(
      "SELECT user_role, company_id FROM users WHERE user_id = $1 LIMIT 1", [session.userId]
    );
    const user = result.rows[0];
    if (!user || user.user_role !== "Owner" || user.company_id == null) {
      return NextResponse.json({ error: "Only company owners can upload a company logo." }, { status: 403 });
    }
    return NextResponse.json({ url: await storeImage(request, "company-logos", user.company_id) }, { status: 201 });
  } catch (error) {
    if (error instanceof ImageUploadError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Failed to upload company logo", error);
    return NextResponse.json({ error: "Could not upload your company logo. Please try again." }, { status: 500 });
  }
}
