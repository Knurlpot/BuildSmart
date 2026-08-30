"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardList,
  EllipsisVertical,
  ListFilter,
  Package,
  Pencil,
  Percent,
  Ruler,
  Search,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { DataTable } from "@/components/data-table/DataTable";
import { apiClient } from "@/lib/api/client";
import { useExistingRules, useMaterialRules } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { RULE_KIND_LABEL, RULE_KINDS, type ExistingRuleSummary, type RuleKind } from "@/lib/dev/provisional/companyRulesTypes";

type RuleWithTier = ExistingRuleSummary & { tier?: "Practical" | "Premium" };

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

function tierBadgeClass(tier: RuleWithTier["tier"]) {
  return tier === "Premium"
    ? "bg-blue-50 text-blue-700"
    : "bg-orange-50 text-primary";
}

function RuleLabel({ rule }: { rule: RuleWithTier }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium text-gray-800">{rule.label}</span>
      {rule.tier && (
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tierBadgeClass(rule.tier)}`}>
          {rule.tier}
        </span>
      )}
    </div>
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
type StatusFilter = "all" | ExistingRuleSummary["status"];
const RULE_FILTER_KINDS = RULE_KINDS.filter((kind) => kind !== "scope-template");
const STATUS_FILTERS: StatusFilter[] = ["all", "Active", "Disabled"];

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
  const [actionsOpen, setActionsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  const urlType = searchParams.get("type");
  const ruleFilter: RuleFilter = isRuleFilter(urlType) ? urlType : "all";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [draftRuleFilter, setDraftRuleFilter] = useState<RuleFilter>(ruleFilter);
  const [draftStatusFilter, setDraftStatusFilter] = useState<StatusFilter>(statusFilter);
  const [search, setSearch] = useState("");

  const selectRuleFilter = useCallback((filter: RuleFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === "all") params.delete("type");
    else params.set("type", filter);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const openFilterMenu = () => {
    setDraftRuleFilter(ruleFilter);
    setDraftStatusFilter(statusFilter);
    setFilterOpen(true);
  };

  const applyFilters = () => {
    selectRuleFilter(draftRuleFilter);
    setStatusFilter(draftStatusFilter);
    setFilterOpen(false);
  };

  const clearFilters = () => {
    setDraftRuleFilter("all");
    setDraftStatusFilter("all");
    selectRuleFilter("all");
    setStatusFilter("all");
    setFilterOpen(false);
  };

  const materialRuleGroups = useMemo<RuleWithTier[]>(() => {
    const grouped = materialRules.reduce((groups, rule) => {
      const treatment = rule.treatment_type?.trim() || "No treatment type";
      const tier = rule.treatment_tier ?? "Practical";
      const key = `${treatment}::${tier}`;
      groups.set(key, [...(groups.get(key) ?? []), rule]);
      return groups;
    }, new Map<string, typeof materialRules>());

    return Array.from(grouped, ([groupKey, materials]) => {
      const [treatmentType, rawTier] = groupKey.split("::");
      const tier = rawTier === "Premium" ? "Premium" : "Practical";
      const itemNames = materials.map((rule) => rule.preferred_item_name).sort((a, b) => a.localeCompare(b));
      const latestEffective = materials
        .map((rule) => rule.effective_date)
        .sort()
        .at(-1) ?? "";

      return {
        rule_id: groupKey,
        rule_kind: "material-rule" as const,
        label: treatmentType,
        detail: `${materials.length} material${materials.length === 1 ? "" : "s"} · ${itemNames.join(", ")}`,
        status: materials.some((rule) => rule.is_active) ? "Active" as const : "Disabled" as const,
        effective_date: latestEffective,
        tier,
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [materialRules]);
  const materialRuleIdsByGroup = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const rule of materialRules) {
      const treatment = rule.treatment_type?.trim() || "No treatment type";
      const key = `${treatment}::${rule.treatment_tier ?? "Practical"}`;
      grouped.set(key, [...(grouped.get(key) ?? []), rule.rule_id]);
    }
    return grouped;
  }, [materialRules]);

  const displayRules = useMemo<RuleWithTier[]>(
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
      const matchesStatus = statusFilter === "all" || rule.status === statusFilter;
      if (!matchesKind || !matchesStatus) return false;
      if (!query) return true;
      return rule.label.toLowerCase().includes(query);
    });
  }, [displayRules, ruleFilter, search, statusFilter]);
  const selectedRules = useMemo(
    () => filteredRules.filter((rule) => selectedRuleIds.has(rule.rule_id) && rule.status !== "Disabled"),
    [filteredRules, selectedRuleIds]
  );
  const selectedRuleCount = selectedRules.length;

  const toggleRuleSelection = useCallback((ruleId: string) => {
    setSelectedRuleIds((current) => {
      const next = new Set(current);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  }, []);

  const toggleAllVisibleRules = useCallback((visibleIds: string[]) => {
    setSelectedRuleIds((current) => {
      const selectableIds = visibleIds.filter((id) => filteredRules.some((rule) => rule.rule_id === id && rule.status !== "Disabled"));
      const allSelected = selectableIds.length > 0 && selectableIds.every((id) => current.has(id));
      const next = new Set(current);
      if (allSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }, [filteredRules]);

  const stopSelecting = useCallback(() => {
    setSelectMode(false);
    setSelectedRuleIds(new Set());
  }, []);

  const handleDisable = useCallback(async (rule: RuleWithTier) => {
    setActiveRuleId(rule.rule_id);
    setWarningFor(null);
    try {
      if (rule.rule_kind === "material-rule") {
        const groupRuleIds = materialRuleIdsByGroup.get(rule.rule_id) ?? [];
        await Promise.all(
          groupRuleIds.map((ruleId) =>
            apiClient(`/api/company-rules/material-rules/${ruleId}`, {
              method: "DELETE",
              credentials: "include",
            })
          )
        );
        await refetchMaterialRules();
        window.dispatchEvent(new CustomEvent("buildsmart:company-rules-changed", { detail: { kind: "material-rules" } }));
        return;
      }
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
  }, [checkUsage, disable, materialRuleIdsByGroup, refetchMaterialRules]);

  const handleBatchDisable = useCallback(async () => {
    for (const rule of selectedRules) {
      await handleDisable(rule);
    }
    stopSelecting();
  }, [handleDisable, selectedRules, stopSelecting]);

  const columns = useMemo<ColumnDef<RuleWithTier>[]>(
    () => [
      {
        accessorKey: "rule_kind",
        header: "Rule Type",
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <RuleTypeBadge kind={row.original.rule_kind} onClick={() => selectRuleFilter(row.original.rule_kind)} />
        ),
      },
      {
        accessorKey: "label",
        header: "Rule",
        cell: ({ row }) => <RuleLabel rule={row.original} />,
      },
      {
        accessorKey: "detail",
        header: "Detail",
        enableGlobalFilter: false,
        cell: ({ row }) => <RuleDetail rule={row.original} />,
      },
      {
        accessorKey: "effective_date",
        header: "Effective",
        enableGlobalFilter: false,
        meta: { className: "w-28" },
      },
      {
        accessorKey: "status",
        header: "Status",
        enableGlobalFilter: false,
        meta: { className: "w-24 text-right" },
        cell: ({ row }) => (
          <span className="flex justify-end">
            <StatusBadge status={row.original.status} />
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableGlobalFilter: false,
        meta: { className: "w-16 text-right" },
        cell: ({ row }) => {
          const rule = row.original;
          if (rule.status === "Disabled") return null;
          return (
            <div className="flex items-center justify-end gap-1.5">
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
            </div>
          );
        },
      },
    ],
    [onViewRule, selectRuleFilter]
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
              placeholder="Search by rule name..."
              className="w-full rounded-full border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-xs font-medium text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (filterOpen) {
                    setFilterOpen(false);
                    return;
                  }
                  openFilterMenu();
                }}
                aria-label="Rule filters"
                title="Rule filters"
                aria-expanded={filterOpen}
                aria-haspopup="menu"
                className={`relative flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition ${
                  ruleFilter !== "all" || statusFilter !== "all"
                    ? "border-primary bg-orange-50 text-primary"
                    : "border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-primary"
                }`}
              >
                <ListFilter className="h-3.5 w-3.5" />
                {(ruleFilter !== "all" || statusFilter !== "all") && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                )}
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                  <div className="px-2">
                    <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Rule Type</p>
                    <button
                      type="button"
                      onClick={() => setDraftRuleFilter("all")}
                      className={`flex w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium transition hover:bg-gray-50 ${
                        draftRuleFilter === "all" ? "text-primary" : "text-gray-700"
                      }`}
                    >
                      All
                    </button>
                    {RULE_FILTER_KINDS.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setDraftRuleFilter(kind)}
                        className={`flex w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium transition hover:bg-gray-50 ${
                          draftRuleFilter === kind ? "text-primary" : "text-gray-700"
                        }`}
                      >
                        {RULE_KIND_LABEL[kind]}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 border-t border-gray-100 px-2 pt-2">
                    <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</p>
                    {STATUS_FILTERS.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setDraftStatusFilter(status)}
                        className={`flex w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium transition hover:bg-gray-50 ${
                          draftStatusFilter === status ? "text-primary" : "text-gray-700"
                        }`}
                      >
                        {status === "all" ? "All" : status}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2 border-t border-gray-100 px-2 pt-2">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={applyFilters}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
            {selectMode ? (
              <div className="flex items-center gap-2 border-l border-gray-200 pl-2">
                <span className="text-xs font-semibold text-gray-500">{selectedRuleCount} selected</span>
                <button
                  type="button"
                  onClick={handleBatchDisable}
                  disabled={selectedRuleCount === 0 || isCheckingUsage || isDisabling || activeRuleId !== null}
                  aria-label="Disable selected rules"
                  title="Disable selected rules"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={stopSelecting}
                  aria-label="Cancel rule selection"
                  title="Cancel rule selection"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative border-l border-gray-200 pl-2">
                <button
                  type="button"
                  onClick={() => setActionsOpen((open) => !open)}
                  aria-label="Rule actions"
                  title="Rule actions"
                  aria-expanded={actionsOpen}
                  aria-haspopup="menu"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-primary/40 hover:text-primary"
                >
                  <EllipsisVertical className="h-4 w-4" />
                </button>
                {actionsOpen && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-36 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        setSelectMode(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Select
                    </button>
                  </div>
                )}
              </div>
            )}
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
          emptyTitle={
            search.trim()
              ? "No matching rules"
              : ruleFilter !== "all"
                ? `No ${RULE_KIND_LABEL[ruleFilter]} rules`
                : statusFilter !== "all"
                  ? `No ${statusFilter.toLowerCase()} rules`
                  : "No rules configured"
          }
          emptyHint={
            search.trim()
              ? "Try a different search or clear the filter."
              : ruleFilter !== "all" || statusFilter !== "all"
                ? "Choose another filter or add a new rule."
                : "Configured rules across all categories will appear here once saved."
          }
          minHeight={220}
        >
          <DataTable
            columns={columns}
            data={filteredRules}
            enablePagination
            pageSize={50}
            selectable={
              selectMode
                ? {
                    getRowId: (rule) => rule.rule_id,
                    selectedIds: selectedRuleIds,
                    onToggle: toggleRuleSelection,
                    onToggleAll: toggleAllVisibleRules,
                  }
                : undefined
            }
            onRowClick={selectMode ? (rule) => toggleRuleSelection(rule.rule_id) : onViewRule}
          />
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
