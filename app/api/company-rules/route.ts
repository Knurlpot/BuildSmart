import { NextRequest, NextResponse } from "next/server";
import { companyIdFor, fetchCompanyRules, unauthorized } from "./db";

export async function GET(request: NextRequest) {
  try {
    const companyId = await companyIdFor(request);
    if (!companyId) return unauthorized();
    return NextResponse.json(await fetchCompanyRules(companyId));
  } catch (error) {
    console.error("API request failed", error);
    return NextResponse.json(
      { error: "Failed to fetch company rules. Please try again." },
      { status: 500 }
    );
  }
}
