import { NextRequest, NextResponse } from "next/server";
import { companyIdFor, fetchCompanyRules, unauthorized } from "./db";

export async function GET(request: NextRequest) {
  try {
    const companyId = await companyIdFor(request);
    if (!companyId) return unauthorized();
    return NextResponse.json(await fetchCompanyRules(companyId));
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch company rules: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
