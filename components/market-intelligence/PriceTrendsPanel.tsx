"use client";

// Shared trends UI — used by both the Market Intelligence page and the Pricelist
// "Price Trends" tab, per the instruction not to build a second, divergent trends UI.
// Owns its own region/material filter state and data fetching (useMarketIntelligence),
// so it can be dropped into either page with no external wiring beyond rendering it.
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Filter, Globe2, Info, Landmark, Minus, Sparkles, Truck, TrendingDown, TrendingUp } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { useMarketIntelligence, type HistoricalPriceRecordRow } from "@/hooks/useMarketIntelligence";
import { REGIONS } from "@/lib/regions";
import type { MaterialPriceVariance } from "@/types/entities";

const COLORS = ["#E07B39", "#4f46e5", "#10b981", "#f59e0b", "#06b6d4", "#8b5cf6", "#ec4899"];

const QUARTER_ORDER: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number> = {
  Q1: 0,
  Q2: 1,
  Q3: 2,
  Q4: 3,
};

function fmt(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function fmtMaybe(n: number | null) {
  return n === null ? "N/A" : fmt(n);
}

function pct(n: number) {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function itemLabel(row: Pick<HistoricalPriceRecordRow, "item_code" | "item_name" | "material">) {
  return row.item_name || row.material || `Item #${row.item_code}`;
}

function periodRank(row: Pick<HistoricalPriceRecordRow, "quarter" | "year" | "recorded_at">) {
  if (row.year && row.quarter) return row.year * 10 + QUARTER_ORDER[row.quarter];
  return new Date(row.recorded_at).getTime() / 1000000000000;
}

function materialKey(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

type VarianceAnalysisRow = {
  itemCode: number;
  itemName: string;
  unit: string;
  material: string;
  category: string;
  actualQty: number | null;
  actualPrice: number;
  dpwhRate: number | null;
  psaAdjustedRate: number | null;
  totalVariance: number | null;
  deviationPct: number | null;
  status: "Favorable" | "Unfavorable" | "Benchmark Missing";
  primaryDriver: string;
};

function TrendIcon({ direction }: { direction: MaterialPriceVariance["trend_direction"] }) {
  if (direction === "Up") return <TrendingUp className="h-4 w-4 text-red-500" />;
  if (direction === "Down") return <TrendingDown className="h-4 w-4 text-green-600" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}

interface PriceTrendsPanelProps {
  /** Hide sections that only make sense in the full Market Intelligence context. */
  compact?: boolean;
}

export function PriceTrendsPanel({ compact = false }: PriceTrendsPanelProps) {
  const [region, setRegion] = useState("All");
  const [itemCode, setItemCode] = useState<number | "All">("All");

  const { historical, variances, insight } = useMarketIntelligence({
    region,
    itemCode: itemCode === "All" ? undefined : itemCode,
  });

  const historicalRows = useMemo(() => historical.data ?? [], [historical.data]);

  const items = useMemo(() => {
    const byCode = new Map<number, string>();
    for (const row of historicalRows) {
      if (!byCode.has(row.item_code)) byCode.set(row.item_code, itemLabel(row));
    }
    return [...byCode.entries()].map(([code, label]) => ({ code, label }));
  }, [historicalRows]);

  const filteredRows = useMemo(
    () => (itemCode === "All" ? historicalRows : historicalRows.filter((r) => r.item_code === itemCode)),
    [historicalRows, itemCode]
  );

  const chartSeries = useMemo(() => items.filter((i) => itemCode === "All" || i.code === itemCode), [
    items,
    itemCode,
  ]);

  // quarter/year are nullable on HistoricalPriceRecord (schema v3): DPWH/PSA rows have
  // them, Supplier-upload rows rely on recorded_at instead and can't be placed on this
  // quarterly axis. Charting recorded_at-based rows is a separate, not-yet-built concern.
  const quarterlyRows = useMemo(
    () => filteredRows.filter((r): r is typeof r & { quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'; year: number } => r.quarter != null && r.year != null),
    [filteredRows]
  );

  const chartData = useMemo(() => {
    const periods = new Set<string>();
    const byPeriodAndItem = new Map<string, Map<number, number>>();
    for (const row of quarterlyRows) {
      const period = `${row.quarter} ${row.year}`;
      periods.add(period);
      if (!byPeriodAndItem.has(period)) byPeriodAndItem.set(period, new Map());
      byPeriodAndItem.get(period)!.set(row.item_code, row.price);
    }
    const sortedPeriods = [...periods].sort((a, b) => {
      const [qa, ya] = a.split(" ");
      const [qb, yb] = b.split(" ");
      if (ya !== yb) return Number(ya) - Number(yb);
      return QUARTER_ORDER[qa as 'Q1' | 'Q2' | 'Q3' | 'Q4'] - QUARTER_ORDER[qb as 'Q1' | 'Q2' | 'Q3' | 'Q4'];
    });
    return sortedPeriods.map((period) => {
      const row: Record<string, string | number | null> = { period };
      for (const item of chartSeries) {
        row[item.label] = byPeriodAndItem.get(period)?.get(item.code) ?? null;
      }
      return row;
    });
  }, [quarterlyRows, chartSeries]);

  const varianceRows = useMemo(() => variances.data ?? [], [variances.data]);
  // PSA (CMWPI/CMRPI) rows are per-commodity-group index movement, analytics-only market
  // context — never a specific item's price. Kept visually separate from BuildSmart's own
  // per-item variance so neither reads as the other. Never join a PSA row to item_code.
  const psaVariance = useMemo(() => varianceRows.filter((v) => v.variance_source === "PSA"), [varianceRows]);

  const latestPsaByCommodity = useMemo(() => {
    const map = new Map<string, MaterialPriceVariance>();
    for (const row of psaVariance) {
      const key = materialKey(row.commodity_group);
      if (!key) continue;
      const current = map.get(key);
      const currentRank = current ? current.year * 10 + QUARTER_ORDER[current.quarter] : -1;
      const nextRank = row.year * 10 + QUARTER_ORDER[row.quarter];
      if (!current || nextRank > currentRank) map.set(key, row);
    }
    return map;
  }, [psaVariance]);

  const analysisRows = useMemo<VarianceAnalysisRow[]>(() => {
    const byItem = new Map<number, HistoricalPriceRecordRow[]>();
    for (const row of filteredRows) {
      if (!byItem.has(row.item_code)) byItem.set(row.item_code, []);
      byItem.get(row.item_code)!.push(row);
    }

    const rowsForAnalysis: VarianceAnalysisRow[] = [];

    for (const rows of byItem.values()) {
      const actual = rows
        .filter((r) => r.price_source === "Supplier" || r.price_source === "Internal")
        .sort((a, b) => periodRank(b) - periodRank(a))[0];
      if (!actual) continue;

      const dpwh = rows
        .filter((r) => r.price_source === "DPWH")
        .sort((a, b) => periodRank(b) - periodRank(a))[0];

      const psa =
        latestPsaByCommodity.get(materialKey(actual.material)) ??
        latestPsaByCommodity.get(materialKey(actual.category_type));

      const actualQty = actual.actual_quantity ?? null;
      const dpwhRate: number | null = dpwh?.price ?? null;
      const psaAdjustedRate = dpwhRate === null ? null : dpwhRate * (1 + (psa?.percent_change ?? 0) / 100);
      const totalVariance = dpwhRate !== null && actualQty !== null ? (actual.price - dpwhRate) * actualQty : null;
      const deviationPct = dpwhRate !== null && dpwhRate > 0 ? ((actual.price - dpwhRate) / dpwhRate) * 100 : null;
      const status: VarianceAnalysisRow["status"] =
        dpwhRate === null ? "Benchmark Missing" : actual.price <= dpwhRate ? "Favorable" : "Unfavorable";
      const primaryDriver =
        dpwhRate === null
          ? "No DPWH CMPD match"
          : actual.price <= dpwhRate
            ? "Below DPWH benchmark"
            : psaAdjustedRate !== null && actual.price <= psaAdjustedRate
              ? "PSA market inflation"
              : "Supplier/procurement markup";

      rowsForAnalysis.push({
        itemCode: actual.item_code,
        itemName: itemLabel(actual),
        unit: actual.unit ?? "-",
        material: actual.material ?? "Unclassified",
        category: actual.category_type ?? actual.material ?? "Unclassified",
        actualQty,
        actualPrice: actual.price,
        dpwhRate,
        psaAdjustedRate,
        totalVariance,
        deviationPct,
        status,
        primaryDriver,
      });
    }

    return rowsForAnalysis.sort((a, b) => Math.abs(b.totalVariance ?? b.actualPrice) - Math.abs(a.totalVariance ?? a.actualPrice));
  }, [filteredRows, latestPsaByCommodity]);

  const varianceSummary = useMemo(() => {
    const quantifiable = analysisRows.filter((row) => row.totalVariance !== null && row.dpwhRate !== null && row.actualQty !== null);
    const totalVariance = quantifiable.reduce((sum, row) => sum + (row.totalVariance ?? 0), 0);
    const dpwhBudget = quantifiable.reduce((sum, row) => sum + (row.dpwhRate ?? 0) * (row.actualQty ?? 0), 0);
    const actualCost = quantifiable.reduce((sum, row) => sum + row.actualPrice * (row.actualQty ?? 0), 0);
    const unfavorable = analysisRows.filter((row) => row.status === "Unfavorable").length;
    const marketDriven = analysisRows.filter((row) => row.primaryDriver === "PSA market inflation").length;
    const markupDriven = analysisRows.filter((row) => row.primaryDriver === "Supplier/procurement markup").length;

    return {
      totalVariance,
      dpwhBudget,
      actualCost,
      overallPct: dpwhBudget > 0 ? (totalVariance / dpwhBudget) * 100 : null,
      quantifiableCount: quantifiable.length,
      unfavorable,
      marketDriven,
      markupDriven,
    };
  }, [analysisRows]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <Filter className="h-4 w-4 shrink-0 text-gray-400" />
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          >
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500">Material</label>
          <select
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value === "All" ? "All" : Number(e.target.value))}
            disabled={items.length === 0}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
          >
            <option value="All">All</option>
            {items.map((i) => (
              <option key={i.code} value={i.code}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5">
          <Info className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-xs text-blue-600">Data sourced from DPWH, PSA, and uploaded pricelists</span>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Executive Summary</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">
            Variance analysis compares uploaded Supplier/Internal actual rates against DPWH CMPD baseline rates,
            then uses PSA CMWPI/CMRPI commodity movement as market-inflation context. Peso variance is computed
            where actual quantity is available from quotation/project usage.
          </p>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-400">Overall Variance</p>
            <p className={`mt-1 text-xl font-extrabold ${varianceSummary.totalVariance > 0 ? "text-red-500" : "text-green-600"}`}>
              {fmt(varianceSummary.totalVariance)}
            </p>
            <p className="text-xs text-gray-400">
              {varianceSummary.overallPct === null ? "Qty data unavailable" : `${pct(varianceSummary.overallPct)} vs DPWH CMPD`}
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-400">Actual Cost Covered</p>
            <p className="mt-1 text-xl font-extrabold text-gray-900">{fmt(varianceSummary.actualCost)}</p>
            <p className="text-xs text-gray-400">{varianceSummary.quantifiableCount} item(s) with quantity</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-400">Unfavorable Items</p>
            <p className="mt-1 text-xl font-extrabold text-red-500">{varianceSummary.unfavorable}</p>
            <p className="text-xs text-gray-400">Actual rate above DPWH</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-400">Likely Driver Mix</p>
            <p className="mt-1 text-xl font-extrabold text-gray-900">
              {varianceSummary.marketDriven}/{varianceSummary.markupDriven}
            </p>
            <p className="text-xs text-gray-400">Market / procurement markup</p>
          </div>
        </div>
        <p className="font-bold text-gray-900">Price Trends — {region}</p>
        <p className="mb-4 text-xs text-gray-400">Quarterly unit price per material</p>
        <QueryState
          isLoading={historical.isLoading}
          error={historical.error}
          isEmpty={chartData.length === 0}
          onRetry={historical.refetch}
          emptyTitle="No price history for this region/material yet"
          emptyHint="This chart populates once /api/historical-price-records returns records."
          minHeight={300}
        >
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tick={{ fontSize: 12, fill: "#9ca3af" }} />
                <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} tickFormatter={(v) => "₱" + Number(v).toLocaleString()} />
                <Tooltip
                  formatter={(value, name) => [fmt(Number(value)), String(name)]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {chartSeries.map((item, i) => (
                  <Line
                    key={item.code}
                    type="monotone"
                    dataKey={item.label}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2.5}
                    dot={{ fill: COLORS[i % COLORS.length], r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </QueryState>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Detailed Variance Summary</p>
        <QueryState
          isLoading={historical.isLoading || variances.isLoading}
          error={historical.error ?? variances.error}
          isEmpty={analysisRows.length === 0}
          onRetry={() => {
            historical.refetch();
            variances.refetch();
          }}
          emptyTitle="No actual-vs-DPWH variance data yet"
          emptyHint="Upload or approve Supplier/Internal prices and load DPWH CMPD benchmarks to populate this analysis."
          minHeight={120}
        >
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-4 py-3">Material Item</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3 text-right">Actual Qty</th>
                  <th className="px-4 py-3 text-right">Actual Price</th>
                  <th className="px-4 py-3 text-right">DPWH CMPD Rate</th>
                  <th className="px-4 py-3 text-right">PSA Adjusted Rate</th>
                  <th className="px-4 py-3 text-right">Total Price Variance</th>
                  <th className="px-4 py-3 text-right">Variance %</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Primary Driver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {analysisRows.map((row) => (
                  <tr key={row.itemCode} className="text-gray-600">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{row.itemName}</p>
                      <p className="text-xs text-gray-400">{row.category}</p>
                    </td>
                    <td className="px-4 py-3">{row.unit}</td>
                    <td className="px-4 py-3 text-right">
                      {row.actualQty === null ? "N/A" : row.actualQty.toLocaleString("en-PH")}
                    </td>
                    <td className="px-4 py-3 text-right">{fmt(row.actualPrice)}</td>
                    <td className="px-4 py-3 text-right">{fmtMaybe(row.dpwhRate)}</td>
                    <td className="px-4 py-3 text-right">{fmtMaybe(row.psaAdjustedRate)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${(row.totalVariance ?? 0) > 0 ? "text-red-500" : "text-green-600"}`}>
                      {fmtMaybe(row.totalVariance)}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${(row.deviationPct ?? 0) > 0 ? "text-red-500" : "text-green-600"}`}>
                      {row.deviationPct === null ? "N/A" : pct(row.deviationPct)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold ${
                          row.status === "Unfavorable"
                            ? "bg-red-50 text-red-600"
                            : row.status === "Favorable"
                              ? "bg-green-50 text-green-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.primaryDriver}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-indigo-500" />
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">
            Market Index (PSA) — Not Item-Specific
          </p>
        </div>
        <p className="text-xs text-indigo-400">
          PSA commodity-group index movement, shown as market context only. This is never a
          specific item&apos;s price change and is never used by quotation pricing.
        </p>
        <QueryState
          isLoading={variances.isLoading}
          error={variances.error}
          isEmpty={psaVariance.length === 0}
          onRetry={variances.refetch}
          emptyTitle="No PSA index data yet"
          emptyHint="This section populates once /api/material-price-variances returns PSA-source records."
          minHeight={100}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {psaVariance.map((v) => (
              <div
                key={`psa-${v.commodity_group}-${v.quarter}-${v.year}`}
                className="flex flex-col gap-2 rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500">
                    {v.commodity_group} · {v.quarter} {v.year}
                  </span>
                  <TrendIcon direction={v.trend_direction} />
                </div>
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
                  {v.percent_change.toFixed(1)}%
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-gray-400" />
            <p className="font-bold text-gray-900">Market Trend Comparison</p>
          </div>
          <p className="text-sm leading-relaxed text-gray-600">
            PSA movement explains items where actual pricing is above DPWH but still within the PSA-adjusted proxy rate.
            Items above both DPWH and the PSA-adjusted benchmark are treated as supplier markup, inefficient procurement,
            logistics premium, or a local availability issue requiring commercial review.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-indigo-50 p-3">
              <p className="text-lg font-extrabold text-indigo-600">{varianceSummary.marketDriven}</p>
              <p className="text-xs text-indigo-400">Market-driven</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-lg font-extrabold text-red-500">{varianceSummary.markupDriven}</p>
              <p className="text-xs text-red-400">Markup-driven</p>
            </div>
            <div className="rounded-xl bg-green-50 p-3">
              <p className="text-lg font-extrabold text-green-600">
                {analysisRows.filter((row) => row.status === "Favorable").length}
              </p>
              <p className="text-xs text-green-500">Favorable</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Truck className="h-4 w-4 text-gray-400" />
            <p className="font-bold text-gray-900">Actionable Recommendations</p>
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-gray-600">
            <p>Prioritize negotiation on items tagged supplier/procurement markup, especially high-value unfavorable rows.</p>
            <p>For PSA market-driven increases, update POW/DUPA contingencies and escalation assumptions before final ABC review.</p>
            <p>For missing DPWH benchmarks, fetch the correct regional CMPD release or request district DEO/eFOI support before approval.</p>
          </div>
        </div>
      </div>

      {!compact && (
        <>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-gray-400" />
              <p className="font-bold text-gray-900">Regional Insights</p>
            </div>
            <p className="text-sm text-gray-400">Not yet wired to a backend endpoint.</p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Truck className="h-4 w-4 text-gray-400" />
              <p className="font-bold text-gray-900">Supplier Comparisons</p>
            </div>
            <p className="text-sm text-gray-400">Not yet wired to a backend endpoint.</p>
          </div>
        </>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gray-400" />
          <p className="font-bold text-gray-900">Market Insights</p>
        </div>
        {itemCode === "All" ? (
          <p className="text-sm text-gray-400">Select a material to see its AI-generated insight.</p>
        ) : (
          <QueryState
            isLoading={insight.isLoading}
            error={insight.error}
            isEmpty={!insight.data?.insight}
            onRetry={insight.refetch}
            emptyTitle="No insight available yet"
            emptyHint="This panel renders Gemini-generated interpretive text from the backend — nothing is generated in the browser."
            minHeight={80}
          >
            <p className="text-sm leading-relaxed text-gray-600">{insight.data?.insight}</p>
          </QueryState>
        )}
      </div>
    </div>
  );
}
