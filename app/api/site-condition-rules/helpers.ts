import type { PoolClient } from "pg";
import {
  SITE_CONDITION_FIELDS,
  type SiteConditionRule,
  type SiteConditionRuleEffect,
} from "@/types/entities/site-condition-rule";

const fieldKeys = new Set(SITE_CONDITION_FIELDS.map((field) => field.key));
const effectTypes = new Set(["line_item", "equipment", "safety", "productivity", "schedule", "warning"]);
const pricingMethods = new Set(["fixed", "per_sqm", "labor_percentage", "manual_review"]);
const operators = new Set(["equals", "gte", "lte"]);

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
