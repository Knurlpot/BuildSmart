import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
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

type SiteConditionRuleRow = {
  site_condition_rule_id: number;
  rule_name: string;
  condition_field: SiteConditionRule["condition_field"];
  operator: SiteConditionRule["operator"];
  trigger_value: string;
  scope_of_work: string | null;
  status: string;
  effective_date: string | Date;
};

type SiteConditionEffectRow = SiteConditionRuleEffect & {
  site_condition_rule_id: number;
};

async function companyIdFor(request: NextRequest) {
  const session = readSession(request);
  if (!session) return null;
  const result = await pool.query<{ company_id: number }>("SELECT company_id FROM users WHERE user_id = $1 LIMIT 1", [session.userId]);
  return result.rows[0]?.company_id ?? null;
}

function serialize(row: SiteConditionRuleRow, effects: SiteConditionRuleEffect[] = []): SiteConditionRule {
  return {
    rule_id: `scr-${row.site_condition_rule_id}`,
    rule_name: row.rule_name,
    condition_field: row.condition_field,
    operator: row.operator,
    trigger_value: row.trigger_value,
    scope_of_work: row.scope_of_work,
    effects,
    is_active: row.status === "Active",
    effective_date: row.effective_date instanceof Date ? row.effective_date.toISOString().slice(0, 10) : String(row.effective_date).slice(0, 10),
  };
}

function serializeEffect(row: SiteConditionEffectRow): SiteConditionRuleEffect {
  return {
    effect_key: row.effect_key,
    effect_type: row.effect_type,
    label: row.label,
    description: row.description,
    pricing_method: row.pricing_method,
    rate: row.rate === null ? null : Number(row.rate),
    percentage: row.percentage === null ? null : Number(row.percentage),
    schedule_days: row.schedule_days === null ? null : Number(row.schedule_days),
  };
}

export async function insertSiteConditionEffects(client: PoolClient, ruleId: number, effects: SiteConditionRuleEffect[]) {
  for (const effect of effects) {
    await client.query(
      `INSERT INTO site_condition_rule_effect (
         site_condition_rule_id, effect_key, effect_type, label, description,
         pricing_method, rate, percentage, schedule_days
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ruleId,
        effect.effect_key.trim(),
        effect.effect_type,
        effect.label.trim(),
        effect.description?.trim() ?? "",
        effect.pricing_method,
        effect.rate,
        effect.percentage,
        effect.schedule_days,
      ]
    );
  }
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
            scope_of_work, status, effective_date
     FROM site_condition_rule WHERE company_id = $1
     ORDER BY status, updated_at DESC, site_condition_rule_id DESC`,
    [companyId]
  );
  const effects = await pool.query<SiteConditionEffectRow>(
    `SELECT site_condition_rule_id, effect_key, effect_type, label, description,
            pricing_method, rate::float AS rate, percentage::float AS percentage, schedule_days
     FROM site_condition_rule_effect
     WHERE site_condition_rule_id = ANY($1::int[])
     ORDER BY site_condition_rule_effect_id`,
    [result.rows.map((row) => row.site_condition_rule_id)]
  );
  const effectsByRule = effects.rows.reduce((map, row) => {
    const list = map.get(row.site_condition_rule_id) ?? [];
    list.push(serializeEffect(row));
    map.set(row.site_condition_rule_id, list);
    return map;
  }, new Map<number, SiteConditionRuleEffect[]>());
  return NextResponse.json({ rules: result.rows.map((row) => serialize(row, effectsByRule.get(row.site_condition_rule_id) ?? [])) });
}

export async function POST(request: NextRequest) {
  const companyId = await companyIdFor(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Partial<SiteConditionRule> | null;
  const error = body ? validateSiteConditionRule(body) : "Invalid request body.";
  if (error || !body) return NextResponse.json({ error }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<SiteConditionRuleRow>(
      `INSERT INTO site_condition_rule
         (company_id, rule_name, condition_field, operator, trigger_value, scope_of_work)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING site_condition_rule_id, rule_name, condition_field, operator, trigger_value,
                 scope_of_work, status, effective_date`,
      [companyId, body.rule_name!.trim(), body.condition_field, body.operator, String(body.trigger_value).trim(), body.scope_of_work?.trim() || null]
    );
    await insertSiteConditionEffects(client, result.rows[0].site_condition_rule_id, body.effects!);
    await client.query("COMMIT");
    return NextResponse.json({ rule: serialize(result.rows[0], body.effects!) }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Unable to save site condition rule", err);
    return NextResponse.json({ error: "Unable to save site condition rule." }, { status: 500 });
  } finally {
    client.release();
  }
}
