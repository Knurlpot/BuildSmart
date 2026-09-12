import { NextRequest, NextResponse } from "next/server";

import { getNormalizationApiBaseUrl, getNormalizationApiHeaders } from "@/lib/server/config";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

async function requireCompanyAccess(request: NextRequest, companyIdParam: string) {
  const session = readSession(request);
  const companyId = Number(companyIdParam);
  if (!session || !Number.isInteger(companyId)) return null;

  const result = await pool.query<{ company_id: number }>("SELECT company_id FROM users WHERE user_id = $1 LIMIT 1", [session.userId]);
  return result.rows[0]?.company_id === companyId ? companyId : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const allowedCompanyId = await requireCompanyAccess(request, companyId);
    if (!allowedCompanyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const response = await fetch(`${getNormalizationApiBaseUrl()}/pricelist/source-priority/${allowedCompanyId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...getNormalizationApiHeaders(),
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch source priority from backend" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API request failed", error);
    return NextResponse.json(
      { error: "Failed to fetch source priority. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const allowedCompanyId = await requireCompanyAccess(request, companyId);
    if (!allowedCompanyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();

    const response = await fetch(`${getNormalizationApiBaseUrl()}/pricelist/source-priority/${allowedCompanyId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getNormalizationApiHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to update source priority on backend" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API request failed", error);
    return NextResponse.json(
      { error: "Failed to update source priority. Please try again." },
      { status: 500 }
    );
  }
}
