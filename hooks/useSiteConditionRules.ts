"use client";

import { useFetch } from "@/hooks/useFetch";
import { useMutation } from "@/hooks/useMutation";
import type { SiteConditionRule } from "@/types/entities/site-condition-rule";

export function useSiteConditionRules() {
  const { data, isLoading, error, refetch } = useFetch<{ rules: SiteConditionRule[] }>("/api/site-condition-rules");
  const mutation = useMutation<unknown>();

  const save = async (payload: Omit<SiteConditionRule, "rule_id" | "is_active" | "effective_date">) => {
    await mutation.mutate("/api/site-condition-rules", payload, "POST");
    refetch();
  };
  const update = async (ruleId: string, payload: Omit<SiteConditionRule, "rule_id" | "is_active" | "effective_date">) => {
    await mutation.mutate(`/api/site-condition-rules/${ruleId}`, payload, "PATCH");
    refetch();
  };
  const disable = async (ruleId: string) => {
    await mutation.mutate(`/api/site-condition-rules/${ruleId}`, undefined, "DELETE");
    refetch();
  };

  return { rules: data?.rules ?? [], isLoading, error, refetch, save, update, disable, isSaving: mutation.isLoading, saveError: mutation.error };
}
