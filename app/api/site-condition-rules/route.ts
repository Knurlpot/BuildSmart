import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";
import {
  SITE_CONDITION_FIELDS,
  type SiteConditionRule,
  type SiteConditionRuleEffect,
} from "@/types/entities/site-condition-rule";

const fieldKeys = new Set(SITE_CONDITION_FIELDS.map((field) => field.key));
const operators = new Set(["equals", "gte", "lte"]);
const effectTypes = new Set(["line_item", "equipment", "safety", "productivity", "schedule", "warning"]);
const pricingMethods = new Set(["fixed", "per_sqm", "labor_percentage", "manual_review"]);

async function companyIdFor(request: NextRequest) {
  const session = readSession(request);
  if (!session) return null;
  const result = await pool.query<{ company_id: number }>("SELECT company_id FROM users WHERE user_id = $1 LIMIT 1", [session.userId]);
  return result.rows[0]?.company_id ?? null;
}

function serialize(row: Record<string, unknown>): SiteConditionRule {
  return {
    rule_id: `scr-${row.site_condition_rule_id}`,
    rule_name: String(row.rule_name),
    condition_field: row.condition_field as SiteConditionRule["condition_field"],
    operator: row.operator as SiteConditionRule["operator"],
    trigger_value: String(row.trigger_value),
    scope_of_work: row.scope_of_work === null ? null : String(row.scope_of_work),
    effects: row.effects as SiteConditionRuleEffect[],
    is_active: row.status === "Active",
    effective_date: row.effective_date instanceof Date ? row.effective_date.toISOString().slice(0, 10) : String(row.effective_date).slice(0, 10),
  };
}

function validateEffect(effect: SiteConditionRuleEffect, index: number) {
  if (!effect || !effect.effect_key?.trim()) return `Effect ${index + 1} needs an identifier.`;
  if (!effectTypes.has(effect.effect_type)) return `Effect ${index + 1} has an invalid type.`;
  if (!effect.label?.trim()) return `Effect ${index + 1} needs a label.`;
  if (!pricingMethods.has(effect.pricing_method)) return `Effect ${index + 1} has an invalid pricing method.`;
  for (const value of [effect.rate, effect.percentage, effect.schedule_days]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) return `Effect ${index + 1} has an invalid numeric value.`;
  }
  if (["fixed", "per_sqm"].includes(effect.pricing_method) && effect.rate === null) return `Effect ${index + 1} needs a rate.`;
  if ((effect.effect_type === "productivity" || effect.pricing_method === "labor_percentage") && effect.percentage === null) return `Effect ${index + 1} needs a percentage.`;
  if (effect.effect_type === "schedule" && effect.schedule_days === null) return `Effect ${index + 1} needs schedule days.`;
  return null;
}

export function validateSiteConditionRule(body: Partial<SiteConditionRule>) {
  if (!body.rule_name?.trim()) return "Rule name is required.";
  if (!body.condition_field || !fieldKeys.has(body.condition_field)) return "Select a valid condition field.";
  if (!body.operator || !operators.has(body.operator)) return "Select a valid trigger operator.";
  if (!String(body.trigger_value ?? "").trim()) return "Trigger value is required.";
  if (!Array.isArray(body.effects) || body.effects.length === 0) return "Add at least one rule effect.";
  for (let index = 0; index < body.effects.length; index += 1) {
    const error = validateEffect(body.effects[index], index);
    if (error) return error;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const companyId = await companyIdFor(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pool.query(
    `SELECT site_condition_rule_id, rule_name, condition_field, operator, trigger_value,
            scope_of_work, effects, status, effective_date
     FROM site_condition_rule WHERE company_id = $1
     ORDER BY status, updated_at DESC, site_condition_rule_id DESC`,
    [companyId]
  );
  return NextResponse.json({ rules: result.rows.map(serialize) });
}

export async function POST(request: NextRequest) {
  const companyId = await companyIdFor(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Partial<SiteConditionRule> | null;
  const error = body ? validateSiteConditionRule(body) : "Invalid request body.";
  if (error || !body) return NextResponse.json({ error }, { status: 400 });

  const result = await pool.query(
    `INSERT INTO site_condition_rule
       (company_id, rule_name, condition_field, operator, trigger_value, scope_of_work, effects)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING site_condition_rule_id, rule_name, condition_field, operator, trigger_value,
               scope_of_work, effects, status, effective_date`,
    [companyId, body.rule_name!.trim(), body.condition_field, body.operator, String(body.trigger_value).trim(), body.scope_of_work?.trim() || null, JSON.stringify(body.effects)]
  );
  return NextResponse.json({ rule: serialize(result.rows[0]) }, { status: 201 });
}
