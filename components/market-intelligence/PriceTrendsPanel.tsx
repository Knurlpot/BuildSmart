"use client";

// 
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

function periodOf(row: Pick<HistoricalPriceRecordRow, "quarter" | "year" | "recorded_at">) {
  if (row.year && row.quarter) return { label: `${row.quarter} ${row.year}`, rank: row.year * 10 + QUARTER_ORDER[row.quarter] };
  const date = new Date(row.recorded_at);
  const year = date.getFullYear();
  const quarter = `Q${Math.floor(date.getMonth() / 3) + 1}` as PeriodKey;
  return { label: `${quarter} ${year}`, rank: year * 10 + QUARTER_ORDER[quarter] };
}

function materialKey(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function comparisonKey(row: Pick<HistoricalPriceRecordRow, "item_name" | "material" | "category_type" | "unit">) {
  const name = materialKey(row.material || row.item_name)
    .replace(/\b(type|grade|class)\s+/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const category = materialKey(row.category_type);
  const unit = materialKey(row.unit);
  return `${category}|${unit}|${name}`;
}

type VarianceAnalysisRow = {
  itemCode: number;
  itemName: string;
  unit: string;
  material: string;
  category: string;
  actualPrice: number;
  dpwhRate: number | null;
  psaAdjustedRate: number | null;
  unitVariance: number | null;
  deviationPct: number | null;
  status: "Favorable" | "Unfavorable" | "Benchmark Missing";
  primaryDriver: string;
};

type PeriodKey = 'Q1' | 'Q2' | 'Q3' | 'Q4';

type CategoryVarianceRow = {
  period: string;
  periodRank: number;
  [category: string]: string | number | null;
};

type DrilldownSelection = {
  period: string;
  category: string;
};

type MaterialVariancePoint = {
  itemCode: number;
  itemName: string;
  unit: string;
  category: string;
  period: string;
  actualPrice: number;
  dpwhRate: number;
  variancePeso: number;
  variancePct: number;
};

type ChartClickPayload = {
  payload?: {
    period?: string;
  };
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
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [selectedVariance, setSelectedVariance] = useState<DrilldownSelection | null>(null);

  const { historical, variances, insight } = useMarketIntelligence({
    region,
  });

  const historicalRows = useMemo(() => historical.data ?? [], [historical.data]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const row of historicalRows) {
      values.add(row.category_type ?? row.material ?? "Unclassified");
    }
    return [...values].sort();
  }, [historicalRows]);

  const filteredRows = useMemo(
    () =>
      historicalRows.filter((row) => {
        const matchesCategory = categoryFilter === "All" || (row.category_type ?? row.material ?? "Unclassified") === categoryFilter;
        return matchesCategory;
      }),
    [historicalRows, categoryFilter]
  );

  const categoryVariance = useMemo(() => {
    const sourcePeriod = new Map<string, {
      comparisonKey: string;
      itemCode: number;
      itemName: string;
      unit: string;
      category: string;
      period: string;
      periodRank: number;
      actual: number[];
    }>();
    const dpwhByMaterial = new Map<string, { price: number; periodRank: number }>();

    for (const row of filteredRows) {
      if (!["Supplier", "Internal", "DPWH"].includes(row.price_source)) continue;
      const period = periodOf(row);
      const key = comparisonKey(row);
      if (row.price_source === "DPWH") {
        const current = dpwhByMaterial.get(key);
        if (!current || period.rank > current.periodRank) {
          dpwhByMaterial.set(key, { price: row.price, periodRank: period.rank });
        }
        continue;
      }

      const sourceKey = `${key}-${period.label}`;
      const current = sourcePeriod.get(sourceKey) ?? {
        comparisonKey: key,
        itemCode: row.item_code,
        itemName: itemLabel(row),
        unit: row.unit ?? "-",
        category: row.category_type ?? row.material ?? "Unclassified",
        period: period.label,
        periodRank: period.rank,
        actual: [],
      };
      current.actual.push(row.price);
      sourcePeriod.set(sourceKey, current);
    }

    const materialPoints: MaterialVariancePoint[] = [];
    const pointRanks = new Map<string, number>();
    for (const entry of sourcePeriod.values()) {
      const comparison = dpwhByMaterial.get(entry.comparisonKey);
      if (!comparison || entry.actual.length === 0) continue;
      const actualPrice = entry.actual.reduce((sum, price) => sum + price, 0) / entry.actual.length;
      const dpwhRate = comparison.price;
      if (dpwhRate <= 0) continue;
      materialPoints.push({
        itemCode: entry.itemCode,
        itemName: entry.itemName,
        unit: entry.unit,
        category: entry.category,
        period: entry.period,
        actualPrice,
        dpwhRate,
        variancePeso: actualPrice - dpwhRate,
        variancePct: ((actualPrice - dpwhRate) / dpwhRate) * 100,
      });
      pointRanks.set(`${entry.itemCode}-${entry.period}`, entry.periodRank);
    }

    const categoryPeriod = new Map<string, { totalPct: number; count: number; periodRank: number }>();
    const periodRanks = new Map<string, number>();
    const categories = new Set<string>();

    for (const point of materialPoints) {
      const existingRank = pointRanks.get(`${point.itemCode}-${point.period}`) ?? 0;
      periodRanks.set(point.period, existingRank);
      categories.add(point.category);
      const key = `${point.period}-${point.category}`;
      const current = categoryPeriod.get(key) ?? { totalPct: 0, count: 0, periodRank: existingRank };
      current.totalPct += point.variancePct;
      current.count += 1;
      categoryPeriod.set(key, current);
    }

    const rows: CategoryVarianceRow[] = [...periodRanks.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([period, rank]) => {
        const row: CategoryVarianceRow = { period, periodRank: rank };
        for (const category of categories) {
          const current = categoryPeriod.get(`${period}-${category}`);
          row[category] = current ? current.totalPct / current.count : null;
        }
        return row;
      });

    return {
      rows,
      categories: [...categories].sort(),
      materialPoints,
    };
  }, [filteredRows]);

  const drilldownRows = useMemo(() => {
    if (!selectedVariance) return [];
    return categoryVariance.materialPoints
      .filter((point) => point.period === selectedVariance.period && point.category === selectedVariance.category)
      .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct));
  }, [categoryVariance.materialPoints, selectedVariance]);

  const drilldownChartData = useMemo(
    () => drilldownRows.map((row) => ({
      name: row.itemName,
      variancePct: row.variancePct,
      variancePeso: row.variancePeso,
      actualPrice: row.actualPrice,
      dpwhRate: row.dpwhRate,
    })),
    [drilldownRows]
  );

  const selectedCategoryColor = selectedVariance
    ? COLORS[Math.max(categoryVariance.categories.indexOf(selectedVariance.category), 0) % COLORS.length]
    : COLORS[0];

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
    return categoryVariance.materialPoints.map((point) => {
      const psa =
        latestPsaByCommodity.get(materialKey(point.itemName)) ??
        latestPsaByCommodity.get(materialKey(point.category));
      const psaAdjustedRate = point.dpwhRate * (1 + (psa?.percent_change ?? 0) / 100);
      const status: VarianceAnalysisRow["status"] =
        point.actualPrice <= point.dpwhRate ? "Favorable" : "Unfavorable";
      const primaryDriver =
        point.actualPrice <= point.dpwhRate
            ? "Below DPWH benchmark"
            : point.actualPrice <= psaAdjustedRate
              ? "PSA market inflation"
              : "Supplier/procurement markup";

      return {
        itemCode: point.itemCode,
        itemName: point.itemName,
        unit: point.unit,
        material: point.itemName,
        category: point.category,
        actualPrice: point.actualPrice,
        dpwhRate: point.dpwhRate,
        psaAdjustedRate,
        unitVariance: point.variancePeso,
        deviationPct: point.variancePct,
        status,
        primaryDriver,
      };
    }).sort((a, b) => Math.abs(b.deviationPct ?? 0) - Math.abs(a.deviationPct ?? 0));
  }, [categoryVariance.materialPoints, latestPsaByCommodity]);

  const varianceSummary = useMemo(() => {
    const comparable = analysisRows.filter((row) => row.dpwhRate !== null && row.deviationPct !== null);
    const averagePct = comparable.length
      ? comparable.reduce((sum, row) => sum + (row.deviationPct ?? 0), 0) / comparable.length
      : null;
    const averageUnitVariance = comparable.length
      ? comparable.reduce((sum, row) => sum + (row.unitVariance ?? 0), 0) / comparable.length
      : null;
    const unfavorable = analysisRows.filter((row) => row.status === "Unfavorable").length;
    const marketDriven = analysisRows.filter((row) => row.primaryDriver === "PSA market inflation").length;
    const markupDriven = analysisRows.filter((row) => row.primaryDriver === "Supplier/procurement markup").length;

    return {
      averagePct,
      averageUnitVariance,
      comparableCount: comparable.length,
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
          <label className="text-xs font-semibold text-gray-500">Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setSelectedVariance(null);
            }}
            disabled={categories.length === 0}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
          >
            <option value="All">All</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
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
            then uses PSA CMWPI/CMRPI commodity movement as market-inflation context. Variance is computed from
            unit prices only, without quantity or project usage data.
          </p>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-400">Average Variance</p>
            <p className={`mt-1 text-xl font-extrabold ${(varianceSummary.averagePct ?? 0) > 0 ? "text-red-500" : "text-green-600"}`}>
              {varianceSummary.averagePct === null ? "N/A" : pct(varianceSummary.averagePct)}
            </p>
            <p className="text-xs text-gray-400">Unit price vs DPWH CMPD</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-400">Avg Unit Difference</p>
            <p className={`mt-1 text-xl font-extrabold ${(varianceSummary.averageUnitVariance ?? 0) > 0 ? "text-red-500" : "text-green-600"}`}>
              {varianceSummary.averageUnitVariance === null ? "N/A" : fmt(varianceSummary.averageUnitVariance)}
            </p>
            <p className="text-xs text-gray-400">{varianceSummary.comparableCount} comparable item(s)</p>
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
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-bold text-gray-900">Category Variance Over Time: {region}</p>
            <p className="text-xs text-gray-400">Average % difference between Supplier/Internal prices and DPWH rates</p>
          </div>
          {selectedVariance && (
            <button
              type="button"
              onClick={() => setSelectedVariance(null)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-500 transition hover:border-primary hover:text-primary"
            >
              Show all categories
            </button>
          )}
        </div>
        <QueryState
          isLoading={historical.isLoading}
          error={historical.error}
          isEmpty={categoryVariance.rows.length === 0}
          onRetry={historical.refetch}
          emptyTitle="No comparable Supplier/Internal vs DPWH variance yet"
          emptyHint="This chart needs Supplier/Internal prices and a DPWH baseline with the same normalized material, category, and unit."
          minHeight={300}
        >
          <div className="overflow-x-auto pb-2">
            <div style={{ height: 330, minWidth: Math.max(760, categoryVariance.rows.length * categoryVariance.categories.length * 72) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryVariance.rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 12, fill: "#9ca3af" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} tickFormatter={(v) => pct(Number(v))} />
                  <Tooltip
                    formatter={(value, name) => [pct(Number(value)), String(name)]}
                    labelFormatter={(label) => `Period: ${label}`}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {categoryVariance.categories.map((category, i) => (
                    <Bar
                      key={category}
                      dataKey={category}
                      fill={COLORS[i % COLORS.length]}
                      radius={[4, 4, 0, 0]}
                      onClick={(payload: ChartClickPayload) => {
                        const period = payload.payload?.period;
                        if (period) setSelectedVariance({ period, category });
                      }}
                      className="cursor-pointer"
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {selectedVariance && (
            <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/70 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {selectedVariance.category} · {selectedVariance.period}
                  </p>
                  <p className="text-xs text-gray-400">Material-level variance inside the selected category bar</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-gray-500">
                  {drilldownRows.length} material{drilldownRows.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
                <div className="h-72 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={drilldownChartData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" />
                      <XAxis type="number" tick={{ fontSize: 12, fill: "#9ca3af" }} tickFormatter={(v) => pct(Number(v))} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={150}
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          name === "variancePct" ? pct(Number(value)) : fmt(Number(value)),
                          name === "variancePct" ? "Variance" : String(name),
                        ]}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                      />
                      <Bar dataKey="variancePct" fill={selectedCategoryColor} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-100 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 border-b border-gray-100 bg-white text-gray-400">
                      <tr>
                        <th className="px-3 py-2">Material</th>
                        <th className="px-3 py-2 text-right">Actual</th>
                        <th className="px-3 py-2 text-right">DPWH</th>
                        <th className="px-3 py-2 text-right">Var.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {drilldownRows.map((row) => (
                        <tr key={`${row.itemCode}-${row.period}`} className="text-gray-600">
                          <td className="px-3 py-2 font-semibold text-gray-800">{row.itemName}</td>
                          <td className="px-3 py-2 text-right">{fmt(row.actualPrice)}</td>
                          <td className="px-3 py-2 text-right">{fmt(row.dpwhRate)}</td>
                          <td className={`px-3 py-2 text-right font-bold ${row.variancePct > 0 ? "text-red-500" : "text-green-600"}`}>
                            {pct(row.variancePct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
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
                  <th className="px-4 py-3 text-right">Actual Price</th>
                  <th className="px-4 py-3 text-right">DPWH CMPD Rate</th>
                  <th className="px-4 py-3 text-right">PSA Adjusted Rate</th>
                  <th className="px-4 py-3 text-right">Unit Difference</th>
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
                    <td className="px-4 py-3 text-right">{fmt(row.actualPrice)}</td>
                    <td className="px-4 py-3 text-right">{fmtMaybe(row.dpwhRate)}</td>
                    <td className="px-4 py-3 text-right">{fmtMaybe(row.psaAdjustedRate)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${(row.unitVariance ?? 0) > 0 ? "text-red-500" : "text-green-600"}`}>
                      {fmtMaybe(row.unitVariance)}
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
            Market Index (PSA): Not Item-Specific
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
        {categoryFilter === "All" ? (
          <p className="text-sm text-gray-400">Select a category to focus the variance analysis above.</p>
        ) : (
          <QueryState
            isLoading={insight.isLoading}
            error={insight.error}
            isEmpty={!insight.data?.insight}
            onRetry={insight.refetch}
            emptyTitle="No insight available yet"
            emptyHint="This panel displays Gemini-generated text from the backend."
            minHeight={80}
          >
            <p className="text-sm leading-relaxed text-gray-600">{insight.data?.insight}</p>
          </QueryState>
        )}
      </div>
    </div>
  );
}
