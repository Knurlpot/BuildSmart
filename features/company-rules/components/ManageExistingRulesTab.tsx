"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Ban, CheckCircle2 } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { DataTable } from "@/components/data-table/DataTable";
import { useExistingRules } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import type { ExistingRuleSummary } from "@/lib/dev/provisional/companyRulesTypes";

function StatusBadge({ status }: { status: ExistingRuleSummary["status"] }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      {status}
    </span>
  );
}

export function ManageExistingRulesTab() {
  const { rules, isLoading, error, refetch, checkUsage, isCheckingUsage, disable, isDisabling, disableError } =
    useExistingRules();

  // Local-only overlays, since the dev mock has no real persistence — mirrors the same
  // "optimistic local state on top of a static mock" pattern used by the five rule forms.
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [warningFor, setWarningFor] = useState<ExistingRuleSummary | null>(null);
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);

  const displayRules = useMemo(
    () => rules.map((r) => (disabledIds.has(r.rule_id) ? { ...r, status: "Disabled" as const } : r)),
    [rules, disabledIds]
  );

  const handleDisable = async (rule: ExistingRuleSummary) => {
    setActiveRuleId(rule.rule_id);
    setWarningFor(null);
    try {
      const usage = await checkUsage(rule.rule_id);
      if (usage.in_use) {
        setWarningFor(rule);
        return;
      }
      await disable(rule.rule_id);
      setDisabledIds((prev) => new Set(prev).add(rule.rule_id));
    } catch {
      // surfaced via disableError below — no fabricated success
    } finally {
      setActiveRuleId(null);
    }
  };

  const columns = useMemo<ColumnDef<ExistingRuleSummary>[]>(
    () => [
      { accessorKey: "rule_kind", header: "Rule Type", enableGlobalFilter: false },
      { accessorKey: "label", header: "Rule" },
      { accessorKey: "detail", header: "Detail", enableGlobalFilter: false },
      {
        accessorKey: "status",
        header: "Status",
        enableGlobalFilter: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const rule = row.original;
          const busy = activeRuleId === rule.rule_id && (isCheckingUsage || isDisabling);
          if (rule.status === "Disabled") return null;
          return (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleDisable(rule)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
            >
              <Ban className="h-3.5 w-3.5" /> {busy ? "Checking…" : "Disable"}
            </button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRuleId, isCheckingUsage, isDisabling]
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Manage Existing Rules</h2>
        <p className="text-xs text-gray-500">
          Select a rule and disable it. Rules referenced in active quotations can&apos;t be
          disabled until that reference is cleared.
        </p>
      </div>

      {warningFor && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{warningFor.label}</strong> is referenced in an active quotation and
            can&apos;t be disabled right now. Remove or update the referencing quotation first.
          </span>
        </div>
      )}

      {disableError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t disable that rule: {disableError.message}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={displayRules.length === 0}
          onRetry={refetch}
          emptyTitle="No rules configured yet"
          emptyHint="Configured rules across all categories will appear here once saved."
          minHeight={220}
        >
          <DataTable columns={columns} data={displayRules} enablePagination pageSize={50} />
        </QueryState>
      </div>

      {disabledIds.size > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          {disabledIds.size} rule{disabledIds.size !== 1 ? "s" : ""} disabled this session.
        </div>
      )}
    </div>
  );
}
