import { NextRequest, NextResponse } from "next/server";
import { companyIdFor, createRule, unauthorized, type RuleKindParam } from "../db";

const RULE_KINDS = new Set(["scope-templates", "material-rules", "labor-rules", "pricing-strategy", "unit-rules", "supplier-rules"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> }
) {
  try {
    const companyId = await companyIdFor(request);
    if (!companyId) return unauthorized();

    const { kind } = await params;
    if (!RULE_KINDS.has(kind)) {
      return NextResponse.json({ error: "Unknown rule type" }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(await createRule(companyId, kind as RuleKindParam, body));
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to save rule: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
