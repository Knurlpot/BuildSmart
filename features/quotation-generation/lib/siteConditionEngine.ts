import type { DraftSegment } from "./draftSegment";
import {
  siteConditionField,
  type SiteConditionRule,
  type TriggeredSiteConditionEffect,
} from "@/types/entities/site-condition-rule";

function matches(actual: string, operator: SiteConditionRule["operator"], expected: string) {
  if (operator === "equals") return actual.trim().toLowerCase() === expected.trim().toLowerCase();
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
  return operator === "gte" ? actualNumber >= expectedNumber : actualNumber <= expectedNumber;
}

function amountFor(segment: DraftSegment, effect: SiteConditionRule["effects"][number]) {
  if (effect.pricing_method === "fixed") return effect.rate ?? 0;
  if (effect.pricing_method === "per_sqm") return Math.round((effect.rate ?? 0) * segment.area_sqm * 100) / 100;
  return null;
}

export function evaluateSiteConditionRules(segment: DraftSegment, rules: SiteConditionRule[]): TriggeredSiteConditionEffect[] {
  const conditionByField = new Map((segment.site_conditions ?? []).map((condition) => [condition.field, condition.value]));
  return rules
    .filter((rule) => {
      if (!rule.is_active) return false;
      if (rule.scope_of_work && rule.scope_of_work.trim().toLowerCase() !== segment.treatment_type?.trim().toLowerCase()) return false;
      const actual = conditionByField.get(rule.condition_field);
      return actual !== undefined && matches(actual, rule.operator, rule.trigger_value);
    })
    .flatMap((rule) => {
      const actual = conditionByField.get(rule.condition_field)!;
      const label = siteConditionField(rule.condition_field)?.label ?? rule.condition_field;
      return rule.effects.map((effect) => ({
        ...effect,
        review_key: `${rule.rule_id}:${effect.effect_key}`,
        rule_id: rule.rule_id,
        rule_name: rule.rule_name,
        condition_label: label,
        condition_value: actual,
        computed_amount: amountFor(segment, effect),
      }));
    });
}

export function isSiteConditionEffectIncluded(segment: DraftSegment, reviewKey: string) {
  return segment.site_condition_effect_decisions?.[reviewKey] ?? true;
}
