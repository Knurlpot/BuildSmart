import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";
import type { SiteConditionRule } from "@/types/entities/site-condition-rule";
import { insertSiteConditionEffects, validateSiteConditionRule } from "../helpers";

type Params = { params: Promise<{ ruleId: string }> };

function numericRuleId(value: string) {
  const match = /^scr-(\d+)$/.exec(value);
  return match ? Number(match[1]) : null;
}

async function context(request: NextRequest, ruleId: string) {
  const session = readSession(request);
  const id = numericRuleId(ruleId);
  if (!session || !id) return null;
  const result = await pool.query<{ company_id: number }>("SELECT company_id FROM users WHERE user_id = $1 LIMIT 1", [session.userId]);
  return result.rows[0] ? { companyId: result.rows[0].company_id, id } : null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { ruleId } = await params;
  const auth = await context(request, ruleId);
  if (!auth) return NextResponse.json({ error: "Unauthorized or invalid rule." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Partial<SiteConditionRule> | null;
  const error = body ? validateSiteConditionRule(body) : "Invalid request body.";
  if (error || !body) return NextResponse.json({ error }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE site_condition_rule SET rule_name = $1, condition_field = $2, operator = $3,
         trigger_value = $4, scope_of_work = $5, updated_at = CURRENT_TIMESTAMP
       WHERE site_condition_rule_id = $6 AND company_id = $7 RETURNING site_condition_rule_id`,
      [body.rule_name!.trim(), body.condition_field, body.operator, String(body.trigger_value).trim(), body.scope_of_work?.trim() || null, auth.id, auth.companyId]
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Rule not found." }, { status: 404 });
    }
    await client.query("DELETE FROM site_condition_rule_effect WHERE site_condition_rule_id = $1", [auth.id]);
    await insertSiteConditionEffects(client, auth.id, body.effects!);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Unable to update site condition rule", err);
    return NextResponse.json({ error: "Unable to update site condition rule." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { ruleId } = await params;
  const auth = await context(request, ruleId);
  if (!auth) return NextResponse.json({ error: "Unauthorized or invalid rule." }, { status: 401 });
  const result = await pool.query(
    `UPDATE site_condition_rule SET status = 'Inactive', updated_at = CURRENT_TIMESTAMP
     WHERE site_condition_rule_id = $1 AND company_id = $2 RETURNING site_condition_rule_id`,
    [auth.id, auth.companyId]
  );
  if (!result.rows[0]) return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
