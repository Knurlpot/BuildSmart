// PROVISIONAL — shape pending backend confirmation.
//
// Shared "check usage, then edit-in-place or supersede" flow (Part D) — identical across
// all five rule-type forms (Scope/Material/Labor/Pricing/Unit), so it's implemented once
// here rather than five times. The mock has no real persistence, so the "supersede"
// branch's new row is constructed client-side from what the user typed, same convention
// every save() in this feature already follows — never read back a fabricated success.
import { useState } from 'react';
import { stagingId } from './useCompanyRulesProvisional';
import type { RuleEnvelope } from './companyRulesTypes';

type RulePayload<T extends RuleEnvelope> = Omit<T, keyof RuleEnvelope>;

interface Options<T extends RuleEnvelope> {
  checkUsage: (ruleId: string) => Promise<{ in_use: boolean }>;
  update: (ruleId: string, payload: RulePayload<T>) => Promise<unknown>;
  supersede: (ruleId: string, payload: RulePayload<T>) => Promise<unknown>;
  /** Staging-id prefix for the NEW rule row created when a referenced rule is superseded — e.g. "st", "lr". */
  idPrefix: string;
}

export function useEditableRuleList<T extends RuleEnvelope>({ checkUsage, update, supersede, idPrefix }: Options<T>) {
  const [overrides, setOverrides] = useState<Record<string, Partial<T>>>({});
  const [localExtra, setLocalExtra] = useState<T[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [supersededNotice, setSupersededNotice] = useState(false);

  /** Merge in any local edits/supersessions on top of a base (fixture + optimistic-create) list. */
  const applyOverrides = (base: T[]): T[] =>
    base.map((item) => (overrides[item.rule_id] ? { ...item, ...overrides[item.rule_id] } : item));

  const addCreated = (item: T) => setLocalExtra((prev) => [item, ...prev]);

  /**
   * Runs check-usage, then either updates in place or supersedes. Returns the rule_id the
   * caller should now show as "selected" (unchanged on edit-in-place, the NEW rule's id on
   * supersede) — or null if the check/save failed (error is in `saveError`).
   */
  const saveEdit = async (ruleId: string, payload: RulePayload<T>): Promise<string | null> => {
    setIsSaving(true);
    setSaveError(null);
    setSupersededNotice(false);
    try {
      const usage = await checkUsage(ruleId);
      if (usage.in_use) {
        const newRuleId = stagingId(idPrefix);
        const today = new Date().toISOString().slice(0, 10);
        await supersede(ruleId, payload);
        setOverrides((prev) => ({
          ...prev,
          [ruleId]: { is_active: false, expiration_date: today, superseded_by_rule_id: newRuleId } as Partial<T>,
        }));
        addCreated({ ...payload, rule_id: newRuleId, is_active: true, effective_date: today } as unknown as T);
        setSupersededNotice(true);
        return newRuleId;
      }
      await update(ruleId, payload);
      setOverrides((prev) => ({ ...prev, [ruleId]: payload as Partial<T> }));
      return ruleId;
    } catch (err) {
      setSaveError(err instanceof Error ? err : new Error(String(err)));
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  return { localExtra, addCreated, applyOverrides, saveEdit, isSaving, saveError, supersededNotice };
}
