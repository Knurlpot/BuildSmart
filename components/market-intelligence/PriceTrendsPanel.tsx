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

function itemLabel(row: Pick<HistoricalPriceRecordRow, "item_code" | "item_name" | "material">) {
  return row.item_name || row.material || `Item #${row.item_code}`;
}

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
  const internalVariance = useMemo(
    () => varianceRows.filter((v) => v.variance_source === "Internal"),
    [varianceRows]
  );
  const psaVariance = useMemo(() => varianceRows.filter((v) => v.variance_source === "PSA"), [varianceRows]);

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
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Item Price Variance</p>
        <QueryState
          isLoading={variances.isLoading}
          error={variances.error}
          isEmpty={internalVariance.length === 0}
          onRetry={variances.refetch}
          emptyTitle="No item variance data yet"
          emptyHint="This section populates once /api/material-price-variances returns Internal-source records."
          minHeight={120}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {internalVariance.map((v) => (
              <div
                key={`internal-${v.item_code}-${v.quarter}-${v.year}`}
                className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500">
                    Item #{v.item_code} · {v.quarter} {v.year}
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
