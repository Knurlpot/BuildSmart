"use client";

// 
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bot, Filter, Globe2, Info, Landmark, Minus, Truck, TrendingDown, TrendingUp } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { useMarketIntelligence, type HistoricalPriceRecordRow } from "@/hooks/useMarketIntelligence";
import { apiClient } from "@/lib/api/client";
import { mapToPsaCmrpiCommodityGroup, type CmrpiMappingResult } from "@/lib/psa-cmrpi-mapping";
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

function cmrpiLookupKey(value?: string | null) {
  return materialKey(value)
    .replace(/\b(and|related|compounds)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  psaCommodityGroup: string;
  psaMappingType: CmrpiMappingResult["matchType"];
  psaMappingReason: string;
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

type SupplierComparisonRow = {
  supplierId: number;
  supplierName: string;
  itemCount: number;
  lowestCount: number;
  averagePrice: number;
  averageVariancePct: number | null;
  totalQuotedValue: number;
  favorableCount: number;
};

type MarketSummaryResponse = {
  summary: string;
  source: "gemini" | "fallback";
};

type ResolvedSummary = {
  key: string;
  data: MarketSummaryResponse | null;
  error: Error | null;
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

function buildActionableRecommendations({
  unfavorableCount,
  markupDrivenCount,
  marketDrivenCount,
  topItem,
  topSupplier,
}: {
  unfavorableCount: number;
  markupDrivenCount: number;
  marketDrivenCount: number;
  topItem?: VarianceAnalysisRow;
  topSupplier?: SupplierComparisonRow;
}) {
  const recommendations: string[] = [];

  if (topItem && topItem.deviationPct !== null && topItem.deviationPct > 0) {
    recommendations.push(`Review ${topItem.itemName} first because it is ${topItem.deviationPct.toFixed(1)}% above the adjusted DPWH benchmark.`);
  }
  if (markupDrivenCount > marketDrivenCount) {
    recommendations.push("Negotiate with suppliers or request alternate quotations for markup-driven items before approving the estimate.");
  }
  if (marketDrivenCount > markupDrivenCount) {
    recommendations.push("Update contingency and escalation assumptions for market-driven increases before final pricing review.");
  }
  if (topSupplier) {
    recommendations.push(`Use ${topSupplier.supplierName} as the first comparison point for procurement because it has the strongest current supplier benchmark.`);
  }
  if (unfavorableCount > 0) {
    recommendations.push("Flag unfavorable materials in the BOQ so the estimator can confirm whether to substitute, negotiate, or keep the specified material.");
  }

  return recommendations.length > 0
    ? recommendations.slice(0, 4)
    : ["Upload supplier pricelists and DPWH benchmark data to generate contractor actions."];
}

interface PriceTrendsPanelProps {
  /** Hide sections that only make sense in the full Market Intelligence context. */
  compact?: boolean;
}

export function PriceTrendsPanel({ compact = false }: PriceTrendsPanelProps) {
  const [region, setRegion] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [selectedVariance, setSelectedVariance] = useState<DrilldownSelection | null>(null);
  const [aiSummaryReloadToken, setAiSummaryReloadToken] = useState(0);
  const [aiSummaryResolved, setAiSummaryResolved] = useState<ResolvedSummary>({ key: "", data: null, error: null });

  const { historical, variances } = useMarketIntelligence({
    region,
  });

  const historicalRows = useMemo(() => historical.data ?? [], [historical.data]);
  const varianceRows = useMemo(() => variances.data ?? [], [variances.data]);
  const psaVariance = useMemo(() => varianceRows.filter((v) => v.variance_source === "PSA"), [varianceRows]);

  const latestPsaByCommodity = useMemo(() => {
    const map = new Map<string, MaterialPriceVariance>();
    for (const row of psaVariance) {
      const key = cmrpiLookupKey(row.commodity_group);
      if (!key) continue;
      const current = map.get(key);
      const currentRank = current ? current.year * 10 + QUARTER_ORDER[current.quarter] : -1;
      const nextRank = row.year * 10 + QUARTER_ORDER[row.quarter];
      if (!current || nextRank > currentRank) map.set(key, row);
    }
    return map;
  }, [psaVariance]);

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

  const analysisRows = useMemo<VarianceAnalysisRow[]>(() => {
    return categoryVariance.materialPoints.map((point) => {
      const cmrpiMapping = mapToPsaCmrpiCommodityGroup({
        itemName: point.itemName,
        material: point.itemName,
        category: point.category,
      });
      const psa = latestPsaByCommodity.get(cmrpiLookupKey(cmrpiMapping.commodityGroup)) ?? null;
      const psaAdjustedRate = psa ? point.dpwhRate * (1 + psa.percent_change / 100) : point.dpwhRate;
      const variancePeso = point.actualPrice - psaAdjustedRate;
      const variancePct = psaAdjustedRate > 0 ? (variancePeso / psaAdjustedRate) * 100 : null;
      const status: VarianceAnalysisRow["status"] =
        variancePct !== null && variancePct <= 0 ? "Favorable" : "Unfavorable";
      const primaryDriver =
        point.actualPrice <= point.dpwhRate
            ? "Below DPWH CMPD"
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
        psaCommodityGroup: cmrpiMapping.commodityGroup,
        psaMappingType: cmrpiMapping.matchType,
        psaMappingReason: cmrpiMapping.reason,
        unitVariance: variancePeso,
        deviationPct: variancePct,
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

  const supplierComparisons = useMemo<SupplierComparisonRow[]>(() => {
    const latestDpwhByMaterial = new Map<string, { price: number; periodRank: number }>();
    const latestSupplierByMaterial = new Map<string, HistoricalPriceRecordRow[]>();

    for (const row of filteredRows) {
      if (row.price_source !== "DPWH" && row.price_source !== "Supplier") continue;
      const key = comparisonKey(row);
      const period = periodOf(row);
      if (row.price_source === "DPWH") {
        const current = latestDpwhByMaterial.get(key);
        if (!current || period.rank > current.periodRank) latestDpwhByMaterial.set(key, { price: row.price, periodRank: period.rank });
        continue;
      }
      if (row.supplier_id === null) continue;
      const rows = latestSupplierByMaterial.get(key) ?? [];
      rows.push(row);
      latestSupplierByMaterial.set(key, rows);
    }

    const supplierStats = new Map<number, {
      supplierName: string;
      itemCount: number;
      lowestCount: number;
      totalPrice: number;
      totalVariancePct: number;
      varianceCount: number;
      totalQuotedValue: number;
      favorableCount: number;
    }>();

    for (const [key, rows] of latestSupplierByMaterial) {
      const latestBySupplier = new Map<number, { row: HistoricalPriceRecordRow; rank: number }>();
      for (const row of rows) {
        const supplierId = row.supplier_id;
        if (supplierId === null) continue;
        const period = periodOf(row);
        const current = latestBySupplier.get(supplierId);
        if (!current || period.rank > current.rank) latestBySupplier.set(supplierId, { row, rank: period.rank });
      }

      const latestRows = [...latestBySupplier.values()].map(({ row }) => row);
      const lowestPrice = Math.min(...latestRows.map((row) => row.price));
      const dpwh = latestDpwhByMaterial.get(key);

      for (const row of latestRows) {
        const supplierId = row.supplier_id;
        if (supplierId === null) continue;
        const current = supplierStats.get(supplierId) ?? {
          supplierName: row.supplier_name || `Supplier #${supplierId}`,
          itemCount: 0,
          lowestCount: 0,
          totalPrice: 0,
          totalVariancePct: 0,
          varianceCount: 0,
          totalQuotedValue: 0,
          favorableCount: 0,
        };
        const variancePct = dpwh && dpwh.price > 0 ? ((row.price - dpwh.price) / dpwh.price) * 100 : null;
        current.itemCount += 1;
        current.lowestCount += row.price === lowestPrice ? 1 : 0;
        current.totalPrice += row.price;
        current.totalQuotedValue += row.actual_total_cost ?? 0;
        if (variancePct !== null) {
          current.totalVariancePct += variancePct;
          current.varianceCount += 1;
          current.favorableCount += variancePct <= 0 ? 1 : 0;
        }
        supplierStats.set(supplierId, current);
      }
    }

    return [...supplierStats.entries()]
      .map(([supplierId, row]) => ({
        supplierId,
        supplierName: row.supplierName,
        itemCount: row.itemCount,
        lowestCount: row.lowestCount,
        averagePrice: row.itemCount > 0 ? row.totalPrice / row.itemCount : 0,
        averageVariancePct: row.varianceCount > 0 ? row.totalVariancePct / row.varianceCount : null,
        totalQuotedValue: row.totalQuotedValue,
        favorableCount: row.favorableCount,
      }))
      .sort((a, b) => {
        const varianceA = a.averageVariancePct ?? Number.POSITIVE_INFINITY;
        const varianceB = b.averageVariancePct ?? Number.POSITIVE_INFINITY;
        return varianceA - varianceB || b.lowestCount - a.lowestCount || b.itemCount - a.itemCount;
      });
  }, [filteredRows]);

  const aiSummaryPayload = useMemo(() => ({
    region,
    category_filter: categoryFilter,
    average_variance_pct: varianceSummary.averagePct,
    average_unit_difference: varianceSummary.averageUnitVariance,
    comparable_count: varianceSummary.comparableCount,
    unfavorable_count: varianceSummary.unfavorable,
    market_driven_count: varianceSummary.marketDriven,
    markup_driven_count: varianceSummary.markupDriven,
    favorable_count: analysisRows.filter((row) => row.status === "Favorable").length,
    top_categories: categoryVariance.categories
      .map((category) => {
        const values = categoryVariance.materialPoints.filter((point) => point.category === category).map((point) => point.variancePct);
        if (values.length === 0) return null;
        return {
          category,
          average_variance_pct: values.reduce((sum, value) => sum + value, 0) / values.length,
        };
      })
      .filter((entry): entry is { category: string; average_variance_pct: number } => entry !== null)
      .sort((a, b) => Math.abs(b.average_variance_pct) - Math.abs(a.average_variance_pct))
      .slice(0, 3),
    top_suppliers: supplierComparisons.slice(0, 3).map((supplier) => ({
      supplier_name: supplier.supplierName,
      average_variance_pct: supplier.averageVariancePct,
      favorable_count: supplier.favorableCount,
      item_count: supplier.itemCount,
    })),
    top_items: analysisRows.slice(0, 5).map((row) => ({
      item_name: row.itemName,
      category: row.category,
      deviation_pct: row.deviationPct,
      primary_driver: row.primaryDriver,
    })),
  }), [analysisRows, categoryFilter, categoryVariance.categories, categoryVariance.materialPoints, region, supplierComparisons, varianceSummary.averagePct, varianceSummary.averageUnitVariance, varianceSummary.comparableCount, varianceSummary.marketDriven, varianceSummary.markupDriven, varianceSummary.unfavorable]);
  const canGenerateAiSummary = analysisRows.length > 0 || supplierComparisons.length > 0;
  const aiSummaryRequestKey = canGenerateAiSummary ? `${JSON.stringify(aiSummaryPayload)}::${aiSummaryReloadToken}` : "";
  const displayedAiSummary = canGenerateAiSummary && aiSummaryResolved.key === aiSummaryRequestKey ? aiSummaryResolved.data : null;
  const displayedAiSummaryError = canGenerateAiSummary && aiSummaryResolved.key === aiSummaryRequestKey ? aiSummaryResolved.error : null;
  const displayedAiSummaryLoading = canGenerateAiSummary && aiSummaryResolved.key !== aiSummaryRequestKey;
  const actionableRecommendations = useMemo(() => buildActionableRecommendations({
    unfavorableCount: varianceSummary.unfavorable,
    markupDrivenCount: varianceSummary.markupDriven,
    marketDrivenCount: varianceSummary.marketDriven,
    topItem: analysisRows.find((row) => row.status === "Unfavorable"),
    topSupplier: supplierComparisons[0],
  }), [analysisRows, supplierComparisons, varianceSummary.marketDriven, varianceSummary.markupDriven, varianceSummary.unfavorable]);

  useEffect(() => {
    if (historical.isLoading || variances.isLoading) return;
    if (!canGenerateAiSummary) return;

    const controller = new AbortController();
    const key = `${JSON.stringify(aiSummaryPayload)}::${aiSummaryReloadToken}`;

    apiClient<MarketSummaryResponse>("/api/market-insights/summary", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aiSummaryPayload),
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setAiSummaryResolved({ key, data, error: null });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setAiSummaryResolved({ key, data: null, error: error instanceof Error ? error : new Error("Could not load AI summary.") });
      });

    return () => controller.abort();
  }, [aiSummaryPayload, aiSummaryReloadToken, canGenerateAiSummary, historical.isLoading, variances.isLoading]);

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
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Price Trends</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">
            Supplier rates against DPWH CMPD baseline rates adjusted
            by the latest PSA CMRPI commodity movement.
          </p>
        </div>
      
        <div className="mb-6 rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <p className="text-sm font-bold text-gray-900">Summary</p>
            {displayedAiSummary?.source === "gemini" && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Gemini</span>}
          </div>
          <QueryState
            isLoading={displayedAiSummaryLoading}
            error={displayedAiSummaryError}
            isEmpty={!displayedAiSummary?.summary}
            onRetry={() => {
              setAiSummaryReloadToken((token) => token + 1);
            }}
            emptyTitle="No AI summary yet"
            emptyHint="Load supplier and benchmark data to generate a summary."
            minHeight={120}
          >
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{displayedAiSummary?.summary}</p>
          </QueryState>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-400">Average Variance</p>
            <p className={`mt-1 text-xl font-extrabold ${(varianceSummary.averagePct ?? 0) > 0 ? "text-red-500" : "text-green-600"}`}>
              {varianceSummary.averagePct === null ? "N/A" : pct(varianceSummary.averagePct)}
            </p>
            <p className="text-xs text-gray-400">Unit price vs PSA-adjusted DPWH</p>
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
            <p className="text-xs text-gray-400">Average % difference between Supplier prices and raw DPWH rates</p>
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
          emptyTitle="No comparable Data"
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
          emptyTitle="No actual-vs-DPWH variance data"
          minHeight={120}
        >
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full table-fixed text-left text-[11px] leading-tight">
              <colgroup>
                <col className="w-[17%]" />
                <col className="w-[5%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead className="border-b border-gray-100 bg-gray-50 text-[9px] uppercase tracking-normal text-gray-400 xl:text-[10px] xl:tracking-wide">
                <tr>
                  <th className="px-3 py-2">Material Item</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">PSA CMRPI Group</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Actual Price</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">DPWH CMPD Rate</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">PSA Adjusted Rate</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Unit Difference</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Variance %</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Primary Driver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {analysisRows.map((row) => (
                  <tr key={row.itemCode} className="text-gray-600">
                    <td className="break-words px-3 py-2">
                      <p className="font-semibold text-gray-900">{row.itemName}</p>
                      <p className="mt-0.5 text-[10px] text-gray-400">{row.category}</p>
                    </td>
                    <td className="break-words px-3 py-2">{row.unit}</td>
                    <td className="break-words px-3 py-2">
                      <p className="font-semibold text-gray-700" title={row.psaMappingReason}>
                        {row.psaCommodityGroup}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{fmt(row.actualPrice)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{fmtMaybe(row.dpwhRate)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{fmtMaybe(row.psaAdjustedRate)}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${(row.unitVariance ?? 0) > 0 ? "text-red-500" : "text-green-600"}`}>
                      {fmtMaybe(row.unitVariance)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${(row.deviationPct ?? 0) > 0 ? "text-red-500" : "text-green-600"}`}>
                      {row.deviationPct === null ? "N/A" : pct(row.deviationPct)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
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
                    <td className="break-words px-3 py-2">{row.primaryDriver}</td>
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
            Market Index (PSA): By commodity group
          </p>
        </div>
        <p className="text-xs text-indigo-400">
          PSA CMRPI publishes quarterly commodity price movement data for construction materials.
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
          <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-gray-600">
            {actionableRecommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </div>
      </div>

      {!compact && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Truck className="h-4 w-4 text-gray-400" />
                <p className="font-bold text-gray-900">Supplier Comparisons</p>
              </div>
              <p className="text-sm text-gray-500">Ranked by latest supplier prices against DPWH baselines for the selected filters.</p>
            </div>
            <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-bold text-gray-500">
              {supplierComparisons.length} supplier{supplierComparisons.length === 1 ? "" : "s"}
            </span>
          </div>
          <QueryState
            isLoading={historical.isLoading}
            error={historical.error}
            isEmpty={supplierComparisons.length === 0}
            onRetry={historical.refetch}
            emptyTitle="No supplier prices to compare"
            emptyHint="Upload supplier pricelists with matching DPWH materials to populate this view."
            minHeight={140}
          >
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="min-w-[860px] w-full text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3 text-right">Avg Variance</th>
                    <th className="px-4 py-3 text-right">Avg Price</th>
                    <th className="px-4 py-3 text-right">Lowest Items</th>
                    <th className="px-4 py-3 text-right">Favorable Items</th>
                    <th className="px-4 py-3 text-right">Quote Exposure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {supplierComparisons.map((row, index) => (
                    <tr key={row.supplierId} className="text-gray-600">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-xs font-extrabold text-primary">
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-semibold text-gray-900">{row.supplierName}</p>
                            <p className="text-xs text-gray-400">{row.itemCount} priced item{row.itemCount === 1 ? "" : "s"}</p>
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${(row.averageVariancePct ?? 0) > 0 ? "text-red-500" : "text-green-600"}`}>
                        {row.averageVariancePct === null ? "N/A" : pct(row.averageVariancePct)}
                      </td>
                      <td className="px-4 py-3 text-right">{fmt(row.averagePrice)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{row.lowestCount}</td>
                      <td className="px-4 py-3 text-right">{row.favorableCount}</td>
                      <td className="px-4 py-3 text-right">{fmt(row.totalQuotedValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </QueryState>
        </div>
      )}
    </div>
  );
}
