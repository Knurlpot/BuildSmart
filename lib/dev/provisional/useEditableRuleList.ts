"use client";

import { useState } from "react";

interface UsageResult {
  in_use: boolean;
}

interface EditableRuleListOptions<T, P> {
  checkUsage: (ruleId: string) => Promise<UsageResult>;
  update: (ruleId: string, payload: P) => Promise<T>;
  supersede: (ruleId: string, payload: P) => Promise<T>;
  idPrefix: string;
}

export function useEditableRuleList<T extends { rule_id: string }, P = Partial<T>>({
  checkUsage,
  update,
  supersede,
}: EditableRuleListOptions<T, P>) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [supersededNotice, setSupersededNotice] = useState(false);

  return {
    localExtra: [] as T[],
    isSaving,
    saveError,
    supersededNotice,
    applyOverrides(items: T[]) {
      return items;
    },
    addCreated(_item: T) {
      setSupersededNotice(false);
      setSaveError(null);
    },
    async saveEdit(ruleId: string, payload: P) {
      setIsSaving(true);
      setSaveError(null);
      try {
        const usage = await checkUsage(ruleId);
        const next = usage.in_use ? await supersede(ruleId, payload) : await update(ruleId, payload);
        setSupersededNotice(usage.in_use);
        return next.rule_id;
      } catch (error) {
        setSaveError(error instanceof Error ? error : new Error("Could not save rule changes."));
        return null;
      } finally {
        setIsSaving(false);
      }
    },
  };
}