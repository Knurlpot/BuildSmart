import { NextRequest, NextResponse } from "next/server";
import { companyIdFor, createRule, setRuleStatus, unauthorized, type RuleKindParam } from "../../db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; ruleId: string }> }
) {
  try {
    const companyId = await companyIdFor(request);
    if (!companyId) return unauthorized();

    const { kind, ruleId } = await params;
    await setRuleStatus(companyId, ruleId, "Inactive");
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(await createRule(companyId, kind as RuleKindParam, body));
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to update rule: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const companyId = await companyIdFor(request);
    if (!companyId) return unauthorized();

    const { ruleId } = await params;
    return NextResponse.json(await setRuleStatus(companyId, ruleId, "Inactive"));
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to disable rule: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
