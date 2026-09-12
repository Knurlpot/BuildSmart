import { NextRequest, NextResponse } from "next/server";
import { getNormalizationApiBaseUrl, getNormalizationApiHeaders } from "@/lib/server/config";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type Params = { params: Promise<{ path: string[] }> };

const ALLOWED = [
  /^pricelist\/upload$/,
  /^pricelist\/upload\/[0-9a-fA-F-]+\/confirm-mapping$/,
  /^pricelist\/status\/[0-9a-fA-F-]+$/,
  /^pricelist\/review$/,
  /^pricelist\/review\/\d+$/,
  /^pricelist\/deviations\/resolve$/,
  /^pricelist\/deviations\/resolve-bulk$/,
  /^pricelist\/check-version$/,
];

async function authCompanyId(request: NextRequest) {
  const session = readSession(request);
  if (!session) return null;
  const result = await pool.query<{ company_id: number }>("SELECT company_id FROM users WHERE user_id = $1 LIMIT 1", [session.userId]);
  return result.rows[0]?.company_id ?? null;
}

function isAllowed(path: string) {
  return ALLOWED.some((pattern) => pattern.test(path));
}

async function forward(request: NextRequest, { params }: Params) {
  const path = (await params).path.join("/");
  if (!isAllowed(path)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const companyId = await authCompanyId(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const targetUrl = new URL(`${getNormalizationApiBaseUrl()}/${path}`);
  request.nextUrl.searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));
  targetUrl.searchParams.set("company_id", String(companyId));

  const headers = new Headers(getNormalizationApiHeaders());
  headers.set("Accept", "application/json");

  let body: BodyInit | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const incoming = await request.formData();
      incoming.set("company_id", String(companyId));
      body = incoming;
    } else {
      headers.set("Content-Type", contentType || "application/json");
      body = await request.text();
    }
  }

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
  });
  const responseBody = await response.text();
  return new NextResponse(responseBody, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest, context: Params) {
  return forward(request, context);
}

export async function POST(request: NextRequest, context: Params) {
  return forward(request, context);
}

export async function PATCH(request: NextRequest, context: Params) {
  return forward(request, context);
}

export async function DELETE(request: NextRequest, context: Params) {
  return forward(request, context);
}
