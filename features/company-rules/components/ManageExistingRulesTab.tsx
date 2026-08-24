"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardList,
  Eye,
  Package,
  Pencil,
  Percent,
  Ruler,
  Search,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { DataTable } from "@/components/data-table/DataTable";
import { useExistingRules, useMaterialRules } from "@/lib/dev/provisional/useCompanyRulesProvisional";
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

const RULE_TYPE_STYLE: Record<RuleKind, { icon: LucideIcon; className: string }> = {
  "scope-template": { icon: ClipboardList, className: "bg-orange-50 text-primary" },
  "material-rule": { icon: Package, className: "bg-blue-50 text-blue-700" },
  "supplier-rule": { icon: Truck, className: "bg-emerald-50 text-emerald-700" },
  "labor-rule": { icon: Users, className: "bg-amber-50 text-amber-700" },
  "pricing-strategy": { icon: Percent, className: "bg-violet-50 text-violet-700" },
  "unit-rule": { icon: Ruler, className: "bg-cyan-50 text-cyan-700" },
};

function RuleTypeBadge({ kind, onClick }: { kind: RuleKind; onClick?: () => void }) {
  const style = RULE_TYPE_STYLE[kind];
  const Icon = style.icon;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition hover:ring-2 hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${style.className}`}
      aria-label={`Filter by ${RULE_KIND_LABEL[kind]}`}
      title={`Filter by ${RULE_KIND_LABEL[kind]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {RULE_KIND_LABEL[kind]}
    </button>
  );
}

function RuleDetail({ rule }: { rule: ExistingRuleSummary }) {
  const parts = rule.detail.split(/\s*[·]\s*/).filter(Boolean);
  let primary = rule.detail;
  let secondary: string | null = null;
  let secondaryTitle: string | undefined;

  if (rule.rule_kind === "material-rule" && parts.length > 1) {
    const materials = (parts.at(-1) ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    primary = parts[0];
    secondary = materials.length > 2 ? `${materials.slice(0, 2).join(", ")}...` : materials.join(", ");
    secondaryTitle = materials.join(", ");
  } else if (rule.rule_kind === "supplier-rule" && parts.length > 1) {
    primary = parts[0];
    secondary = parts.slice(1).join(" · ");
  } else if (rule.rule_kind === "scope-template") {
    primary = "Template";
    secondary = rule.detail;
  }

  return (
    <div className="min-w-0">
      <span className="inline-flex max-w-full rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
        <span className="truncate">{primary}</span>
      </span>
      {secondary && <p className="mt-1 max-w-xs truncate text-[11px] text-gray-500" title={secondaryTitle ?? secondary}>{secondary}</p>}
    </div>
  );
}

function ActionTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

interface ManageExistingRulesTabProps {
  /** Opens the rule's owning tab with this rule pre-selected so its detail panel is visible. */
  onViewRule: (rule: ExistingRuleSummary) => void;
}

type RuleFilter = "all" | RuleKind;
const RULE_FILTER_KINDS = RULE_KINDS.filter((kind) => kind !== "scope-template");

function isRuleFilter(value: string | null): value is RuleKind {
  return value !== null && RULE_FILTER_KINDS.some((kind) => kind === value);
}

export function ManageExistingRulesTab({ onViewRule }: ManageExistingRulesTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { rules, isLoading, error, refetch, checkUsage, isCheckingUsage, disable, isDisabling, disableError } =
    useExistingRules();
  const {
    rules: materialRules,
    isLoading: materialRulesLoading,
    error: materialRulesError,
    refetch: refetchMaterialRules,
  } = useMaterialRules();

  // Local-only overlays, since the dev mock has no real persistence — mirrors the same
  // "optimistic local state on top of a static mock" pattern used by the five rule forms.
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [warningFor, setWarningFor] = useState<ExistingRuleSummary | null>(null);
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const urlType = searchParams.get("type");
  const ruleFilter: RuleFilter = isRuleFilter(urlType) ? urlType : "all";
  const [search, setSearch] = useState("");

  const selectRuleFilter = useCallback((filter: RuleFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === "all") params.delete("type");
    else params.set("type", filter);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const materialRuleGroups = useMemo<ExistingRuleSummary[]>(() => {
    const grouped = materialRules.reduce((groups, rule) => {
      const treatment = rule.treatment_type?.trim() || "No treatment type";
      groups.set(treatment, [...(groups.get(treatment) ?? []), rule]);
      return groups;
    }, new Map<string, typeof materialRules>());

    return Array.from(grouped, ([treatmentType, materials]) => {
      const itemNames = materials.map((rule) => rule.preferred_item_name).sort((a, b) => a.localeCompare(b));
      const latestEffective = materials
        .map((rule) => rule.effective_date)
        .sort()
        .at(-1) ?? "";

      return {
        rule_id: treatmentType,
        rule_kind: "material-rule" as const,
        label: treatmentType,
        detail: `${materials.length} material${materials.length === 1 ? "" : "s"} · ${itemNames.join(", ")}`,
        status: materials.some((rule) => rule.is_active) ? "Active" as const : "Disabled" as const,
        effective_date: latestEffective,
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [materialRules]);

  const displayRules = useMemo(
    () => [
      ...materialRuleGroups,
      ...rules
        .filter((rule) => rule.rule_kind !== "scope-template" && rule.rule_kind !== "material-rule")
        .map((r) => (disabledIds.has(r.rule_id) ? { ...r, status: "Disabled" as const } : r)),
    ],
    [disabledIds, materialRuleGroups, rules]
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
        cell: ({ row }) => (
          <RuleTypeBadge kind={row.original.rule_kind} onClick={() => selectRuleFilter(row.original.rule_kind)} />
        ),
      },
      { accessorKey: "label", header: "Rule" },
      {
        accessorKey: "detail",
        header: "Detail",
        enableGlobalFilter: false,
        cell: ({ row }) => <RuleDetail rule={row.original} />,
      },
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
          const isMaterialGroup = rule.rule_kind === "material-rule";
          const busy = activeRuleId === rule.rule_id && (isCheckingUsage || isDisabling);
          if (rule.status === "Disabled") return null;
          return (
            <div className="flex items-center justify-end gap-1.5">
              <ActionTooltip label="View">
              <button
                type="button"
                aria-label={`View ${rule.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onViewRule(rule);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary/40 hover:text-primary"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              </ActionTooltip>
              <ActionTooltip label="Edit">
              <button
                type="button"
                aria-label={`Edit ${rule.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onViewRule(rule);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary/40 hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              </ActionTooltip>
              {!isMaterialGroup && (
                <ActionTooltip label="Disable">
                  <button
                    type="button"
                    disabled={busy}
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
                </ActionTooltip>
              )}
            </div>
          );
        },
      },
    ],
    [activeRuleId, handleDisable, isCheckingUsage, isDisabling, onViewRule, selectRuleFilter]
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
              placeholder="Search by rule name, type, detail, status, or date..."
              className="w-full rounded-full border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-xs font-medium text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
            <button
              type="button"
              onClick={() => selectRuleFilter("all")}
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
                onClick={() => selectRuleFilter(kind)}
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
          isLoading={isLoading || materialRulesLoading}
          error={error ?? materialRulesError}
          isEmpty={filteredRules.length === 0}
          onRetry={() => {
            refetch();
            refetchMaterialRules();
          }}
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
