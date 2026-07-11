"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  Landmark,
  Loader2,
  Minus,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { DataTable } from "@/components/data-table/DataTable";
import {
  deviationKey,
  usePricelistPublishedSource,
  type FlaggedPriceDeviation,
  type PsaIndexEntry,
} from "@/hooks/usePricelistPublishedSource";
import { REGIONS } from "@/lib/regions";

function fmt(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function PercentChangeBadge({ value }: { value: number }) {
  const increased = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        increased ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
      }`}
    >
      {increased ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {increased ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

function TrendIcon({ direction }: { direction: PsaIndexEntry["trend_direction"] }) {
  if (direction === "Up") return <TrendingUp className="h-4 w-4 text-red-500" />;
  if (direction === "Down") return <TrendingDown className="h-4 w-4 text-green-600" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}

function VersionBanner({ status, releaseLabel, upToDateNote, newAvailableNote }: {
  status: "up_to_date" | "new_available";
  releaseLabel: string;
  upToDateNote: string;
  newAvailableNote: string;
}) {
  const upToDate = status === "up_to_date";
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
        upToDate ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      {upToDate ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      )}
      <span>
        {upToDate ? upToDateNote.replace("{release}", releaseLabel) : newAvailableNote.replace("{release}", releaseLabel)}
      </span>
    </div>
  );
}

export function PublishedSourceTab({ onViewCatalog }: { onViewCatalog?: () => void }) {
  const {
    trigger,
    isFetching,
    fetchError,
    flagged,
    resolve,
    isResolving,
    resolveError,
    resolveMany,
    isResolvingBulk,
    resolveBulkError,
    resolutions,
    triggerPsaIndex,
    isFetchingPsaIndex,
    fetchPsaIndexError,
    psaIndex,
    psaIndexResult,
    checkDpwhVersion,
    isCheckingDpwhVersion,
    checkDpwhVersionError,
    dpwhVersionResult,
    checkPsaVersion,
    isCheckingPsaVersion,
    checkPsaVersionError,
    psaVersionResult,
    dpwhCatalog,
  } = usePricelistPublishedSource();
  const [source, setSource] = useState<"DPWH" | "PSA">("DPWH");
  const [region, setRegion] = useState("NCR");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const catalogLoad = dpwhCatalog.load;
  const revealCatalog = useCallback(() => {
    catalogLoad();
  }, [catalogLoad]);

  // Prune selection down to ids still present in `flagged` during render (rows resolved
  // individually, or replaced by a fresh fetch, drop out of the set automatically) —
  // adjusting derived state during render rather than syncing via an effect.
  const flaggedKeys = useMemo(() => new Set(flagged.map(deviationKey)), [flagged]);
  const validSelectedIds = useMemo(
    () => new Set([...selectedIds].filter((id) => flaggedKeys.has(id))),
    [selectedIds, flaggedKeys]
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (ids: string[]) =>
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });

  const selectedItems = useMemo(
    () => flagged.filter((f) => validSelectedIds.has(deviationKey(f))),
    [flagged, validSelectedIds]
  );

  const handleBulk = async (action: "approve" | "reject") => {
    try {
      await resolveMany(selectedItems, action);
      setSelectedIds(new Set());
      revealCatalog();
    } catch {
      // surfaced via resolveBulkError below — no fabricated success
    }
  };

  const handleResolveOne = useCallback(
    async (item: FlaggedPriceDeviation, action: "approve" | "reject") => {
      try {
        await resolve(item, action);
        revealCatalog();
      } catch {
        // surfaced via resolveError below — no fabricated success
      }
    },
    [resolve, revealCatalog]
  );

  const handleCheckDpwh = async () => {
    setSelectedIds(new Set());
    try {
      const status = await checkDpwhVersion(region);
      if (status.status === "new_available") {
        await trigger(region).catch(() => {});
      } else {
        revealCatalog();
      }
    } catch {
      // surfaced via checkDpwhVersionError below
    }
  };

  const handleCheckPsa = async () => {
    try {
      await checkPsaVersion();
    } catch {
      // surfaced via checkPsaVersionError below
    }
    triggerPsaIndex().catch(() => {}); // both statuses land on the (possibly refreshed) index view
  };

  const columns = useMemo<ColumnDef<FlaggedPriceDeviation>[]>(
    () => [
      {
        accessorKey: "item_name",
        header: "Material",
        cell: ({ row }) => (
          <span className="font-medium text-gray-800">
            {row.original.item_name ?? `Item #${row.original.item_code}`}
          </span>
        ),
      },
      { accessorKey: "source", header: "Source", enableGlobalFilter: false },
      { accessorKey: "region", header: "Region", enableGlobalFilter: false },
      {
        id: "period",
        header: "Period",
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <span className="text-gray-500">
            {row.original.quarter} {row.original.year}
          </span>
        ),
      },
      {
        accessorKey: "previous_price",
        header: "Previous Price",
        enableGlobalFilter: false,
        cell: ({ getValue }) => <span className="text-gray-400 line-through">{fmt(getValue<number>())}</span>,
      },
      {
        accessorKey: "new_price",
        header: "New Price",
        enableGlobalFilter: false,
        cell: ({ getValue }) => <span className="font-semibold text-gray-900">{fmt(getValue<number>())}</span>,
      },
      {
        accessorKey: "percent_change",
        header: "% Change",
        enableGlobalFilter: false,
        cell: ({ getValue }) => <PercentChangeBadge value={getValue<number>()} />,
      },
      {
        id: "actions",
        header: "",
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isResolving}
              onClick={() => handleResolveOne(row.original, "approve")}
              title="Approve new price"
              className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 transition hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={isResolving}
              onClick={() => handleResolveOne(row.original, "reject")}
              title="Keep previous price"
              className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 transition hover:border-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      },
    ],
    [isResolving, handleResolveOne]
  );

  const outcomeCounts = useMemo(() => {
    let increased = 0;
    let decreased = 0;
    for (const outcome of resolutions.values()) {
      if (outcome === "increased") increased++;
      else if (outcome === "decreased") decreased++;
    }
    return { increased, decreased };
  }, [resolutions]);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="mb-4 text-sm font-bold text-gray-900">Fetch from a published source</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Source</label>
            <div className="flex gap-2">
              {(["DPWH", "PSA"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition ${
                    source === s
                      ? "border-primary bg-orange-50/40 text-primary"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Region</label>
            {source === "DPWH" ? (
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
              >
                {REGIONS.filter((r) => r !== "All").map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-400">
                NCR only — PSA publishes no other region
              </div>
            )}
          </div>
          <div className="flex items-end">
            {source === "DPWH" ? (
              <button
                type="button"
                disabled={isCheckingDpwhVersion || isFetching}
                onClick={handleCheckDpwh}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
              >
                {isCheckingDpwhVersion || isFetching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {isCheckingDpwhVersion ? "Checking…" : "Fetching…"}
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4" /> Fetch Latest Prices
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={isCheckingPsaVersion || isFetchingPsaIndex}
                onClick={handleCheckPsa}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
              >
                {isCheckingPsaVersion || isFetchingPsaIndex ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {isCheckingPsaVersion ? "Checking…" : "Loading…"}
                  </>
                ) : (
                  <>
                    <Landmark className="h-4 w-4" /> Load Market Index
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {source === "DPWH" ? (
        <>
          {checkDpwhVersionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Couldn&apos;t check the DPWH release: {checkDpwhVersionError.message}
            </div>
          )}

          {dpwhVersionResult && !isCheckingDpwhVersion && (
            <VersionBanner
              status={dpwhVersionResult.status}
              releaseLabel={dpwhVersionResult.release_label}
              upToDateNote="You have the latest DPWH-CMPD release ({release})."
              newAvailableNote="A new DPWH-CMPD report has been published ({release}) — review and assess the significant deviations below."
            />
          )}

          {dpwhVersionResult?.status === "up_to_date" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
              <div>
                <p className="text-sm font-bold text-gray-900">Current DPWH catalog readings</p>
                {dpwhCatalog.isLoading ? (
                  <p className="text-xs text-gray-400">Loading…</p>
                ) : dpwhCatalog.error ? (
                  <p className="text-xs text-red-500">Couldn&apos;t load: {dpwhCatalog.error.message}</p>
                ) : (
                  <p className="text-xs text-gray-500">
                    {dpwhCatalog.records.length} material{dpwhCatalog.records.length !== 1 ? "s" : ""} currently
                    priced from DPWH-CMPD in your catalog.
                  </p>
                )}
              </div>
              {onViewCatalog && (
                <button
                  type="button"
                  onClick={onViewCatalog}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-gray-50"
                >
                  <Eye className="h-3.5 w-3.5" /> View Full Catalog
                </button>
              )}
            </div>
          )}

          {resolveError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Couldn&apos;t save that decision: {resolveError.message}
            </div>
          )}
          {resolveBulkError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Couldn&apos;t save that bulk decision: {resolveBulkError.message}
            </div>
          )}

          {dpwhVersionResult?.status === "new_available" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Flagged for Review</p>
                {flagged.length > 0 && (
                  <div className="flex items-center gap-3 text-xs">
                    {validSelectedIds.size > 0 ? (
                      <>
                        <span className="font-semibold text-gray-600">{validSelectedIds.size} selected</span>
                        <button
                          type="button"
                          onClick={() => setSelectedIds(new Set())}
                          className="font-semibold text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
                        >
                          Clear selection
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set(flagged.map(deviationKey)))}
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        Select all {flagged.length} flagged
                      </button>
                    )}
                  </div>
                )}
              </div>

              {validSelectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-2.5">
                  <span className="text-xs text-amber-700">Apply to {validSelectedIds.size} selected row(s):</span>
                  <button
                    type="button"
                    disabled={isResolvingBulk}
                    onClick={() => handleBulk("approve")}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover) disabled:opacity-60"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" /> {isResolvingBulk ? "Saving…" : "Approve New Price"}
                  </button>
                  <button
                    type="button"
                    disabled={isResolvingBulk}
                    onClick={() => handleBulk("reject")}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" /> Keep Previous
                  </button>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <QueryState
                  isLoading={isFetching}
                  error={fetchError}
                  isEmpty={flagged.length === 0}
                  onRetry={() => trigger(region).catch(() => {})}
                  emptyTitle="No deviations flagged"
                  emptyHint="Every fetched price was auto-saved without a significant enough deviation to need review."
                  minHeight={160}
                >
                  <DataTable
                    columns={columns}
                    data={flagged}
                    compact
                    enablePagination
                    pageSize={50}
                    selectable={{
                      getRowId: deviationKey,
                      selectedIds: validSelectedIds,
                      onToggle: toggle,
                      onToggleAll: toggleAll,
                    }}
                  />
                </QueryState>
              </div>

              {(resolutions.size > 0 || dpwhCatalog.records.length > 0) && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="font-bold uppercase tracking-wider text-gray-400">DPWH Catalog</span>
                    {resolutions.size > 0 && (
                      <>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-300" /> {outcomeCounts.increased} increased
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-green-300" /> {outcomeCounts.decreased} decreased
                        </span>
                      </>
                    )}
                  </div>
                  {onViewCatalog && (
                    <button
                      type="button"
                      onClick={onViewCatalog}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-gray-50"
                    >
                      <Eye className="h-3.5 w-3.5" /> View Full Catalog
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {checkPsaVersionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Couldn&apos;t check the PSA release: {checkPsaVersionError.message}
            </div>
          )}
          {fetchPsaIndexError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Couldn&apos;t load the PSA index: {fetchPsaIndexError.message}
            </div>
          )}

          {psaVersionResult && !isCheckingPsaVersion && (
            <VersionBanner
              status={psaVersionResult.status}
              releaseLabel={psaVersionResult.release_label}
              upToDateNote="You have the latest PSA indices ({release})."
              newAvailableNote="A new PSA index has been published ({release}) — the market view below reflects it."
            />
          )}

          {psaIndexResult && (
            <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-indigo-500" />
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">
                  PSA Market Index (NCR) — Analytics Only
                </p>
              </div>
              <p className="text-xs text-indigo-400">
                Index numbers, base-year referenced — not peso prices. This is market context
                to read, not something to approve: nothing here is written to your catalog.
              </p>
              <QueryState
                isLoading={isFetchingPsaIndex}
                error={fetchPsaIndexError}
                isEmpty={psaIndex.length === 0}
                onRetry={() => triggerPsaIndex().catch(() => {})}
                emptyTitle="No PSA index data yet"
                emptyHint="This section populates once the PSA index fetch returns commodity-group records."
                minHeight={160}
              >
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {psaIndex.map((v) => (
                    <div
                      key={`${v.commodity_group}-${v.quarter}-${v.year}`}
                      className="flex flex-col gap-2 rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500">
                          {v.commodity_group} · {v.quarter} {v.year}
                        </span>
                        <TrendIcon direction={v.trend_direction} />
                      </div>
                      {v.index_value !== undefined && (
                        <p className="text-xs text-gray-400">Index {v.index_value.toFixed(1)}</p>
                      )}
                      <p
                        className={`text-lg font-extrabold ${
                          v.trend_direction === "Up"
                            ? "text-red-500"
                            : v.trend_direction === "Down"
                              ? "text-green-600"
                              : "text-gray-700"
                        }`}
                      >
                        {v.percent_change > 0 ? "+" : ""}
                        {v.percent_change.toFixed(1)}% YoY
                      </p>
                      {v.is_significant_spike && (
                        <span className="w-fit rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                          Significant spike
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </QueryState>
            </div>
          )}
        </>
      )}
    </div>
  );
}
