"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Ban, CheckCircle2, Eye, Pencil, Search } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { DataTable } from "@/components/data-table/DataTable";
import { useExistingRules } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { RULE_KIND_LABEL, RULE_KINDS, type ExistingRuleSummary, type RuleKind } from "@/lib/dev/provisional/companyRulesTypes";

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

interface ManageExistingRulesTabProps {
  /** Opens the rule's owning tab with this rule pre-selected so its detail panel is visible. */
  onViewRule: (rule: ExistingRuleSummary) => void;
}

type RuleFilter = "all" | RuleKind;
const RULE_FILTER_KINDS = RULE_KINDS.filter((kind) => kind !== "material-rule");

export function ManageExistingRulesTab({ onViewRule }: ManageExistingRulesTabProps) {
  const { rules, isLoading, error, refetch, checkUsage, isCheckingUsage, disable, isDisabling, disableError } =
    useExistingRules();

  // Local-only overlays, since the dev mock has no real persistence — mirrors the same
  // "optimistic local state on top of a static mock" pattern used by the five rule forms.
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [warningFor, setWarningFor] = useState<ExistingRuleSummary | null>(null);
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>("all");
  const [search, setSearch] = useState("");

  const displayRules = useMemo(
    () => rules.map((r) => (disabledIds.has(r.rule_id) ? { ...r, status: "Disabled" as const } : r)),
    [rules, disabledIds]
  );
  const filteredRules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return displayRules.filter((rule) => {
      const matchesKind = ruleFilter === "all" || rule.rule_kind === ruleFilter;
      if (!matchesKind) return false;
      if (!query) return true;
      return [
        RULE_KIND_LABEL[rule.rule_kind],
        rule.label,
        rule.detail,
        rule.effective_date,
        rule.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [displayRules, ruleFilter, search]);

  const handleDisable = useCallback(async (rule: ExistingRuleSummary) => {
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
  }, [checkUsage, disable]);

  const columns = useMemo<ColumnDef<ExistingRuleSummary>[]>(
    () => [
      {
        accessorKey: "rule_kind",
        header: "Rule Type",
        enableGlobalFilter: false,
        cell: ({ row }) => RULE_KIND_LABEL[row.original.rule_kind],
      },
      { accessorKey: "label", header: "Rule" },
      { accessorKey: "detail", header: "Detail", enableGlobalFilter: false },
      { accessorKey: "effective_date", header: "Effective", enableGlobalFilter: false },
      {
        accessorKey: "status",
        header: "Status",
        enableGlobalFilter: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: () => (
          <span className="flex justify-end">
            <span className="w-[6.75rem] text-center">Action</span>
          </span>
        ),
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const rule = row.original;
          const busy = activeRuleId === rule.rule_id && (isCheckingUsage || isDisabling);
          if (rule.status === "Disabled") return null;
          return (
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                title="View rule"
                aria-label={`View ${rule.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onViewRule(rule);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary/40 hover:text-primary"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Edit rule"
                aria-label={`Edit ${rule.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onViewRule(rule);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary/40 hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                title="Disable rule"
                aria-label={`Disable ${rule.label}`}
                onClick={(e) => {
                  // Don't also trigger the row's own "open in owning tab" click.
                  e.stopPropagation();
                  handleDisable(rule);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        },
      },
    ],
    [activeRuleId, handleDisable, isCheckingUsage, isDisabling, onViewRule]
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Manage Existing Rules</h2>
        <p className="text-xs text-gray-500">
          Open, edit, or disable saved rules.
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
        <div className="grid items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 xl:grid-cols-[minmax(24rem,1fr)_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rules..."
              className="w-full rounded-full border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-xs font-medium text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
            <button
              type="button"
              onClick={() => setRuleFilter("all")}
              className={`w-fit whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                ruleFilter === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-gray-200 bg-white text-gray-500 hover:border-primary/40 hover:text-primary"
              }`}
            >
              All
            </button>
            {RULE_FILTER_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setRuleFilter(kind)}
                className={`w-fit whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  ruleFilter === kind
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-gray-200 bg-white text-gray-500 hover:border-primary/40 hover:text-primary"
                }`}
              >
                {RULE_KIND_LABEL[kind]}
              </button>
            ))}
          </div>
        </div>
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={filteredRules.length === 0}
          onRetry={refetch}
          emptyTitle={search.trim() ? "No matching rules" : ruleFilter === "all" ? "No rules configured" : `No ${RULE_KIND_LABEL[ruleFilter]} rules`}
          emptyHint={
            search.trim()
              ? "Try a different search or clear the filter."
              : ruleFilter === "all"
                ? "Configured rules across all categories will appear here once saved."
                : "Choose another rule type or add a new rule."
          }
          minHeight={220}
        >
          <DataTable columns={columns} data={filteredRules} enablePagination pageSize={50} />
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
