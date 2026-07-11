"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Filter, Lightbulb } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { QueryState } from "@/components/feedback/QueryState";
import { DataTable } from "@/components/data-table/DataTable";
import { useSupplierBenchmarks, type SupplierBenchmarkRow } from "@/hooks/useSupplierBenchmarks";
import { REGIONS } from "@/lib/regions";

const SCORE_DIMENSIONS: { key: keyof SupplierBenchmarkRow; label: string }[] = [
  { key: "average_price_score", label: "Avg. Price Score" },
  { key: "update_frequency_score", label: "Update Frequency" },
  { key: "reliability_score", label: "Reliability" },
  { key: "delivery_score", label: "Delivery" },
  { key: "overall_score", label: "Overall Score" },
];

const RANKING_COLUMNS: ColumnDef<SupplierBenchmarkRow>[] = [
  {
    accessorKey: "supplier_name",
    header: "Supplier",
    cell: ({ getValue }) => getValue<string | undefined>() ?? "—",
  },
  {
    accessorKey: "region",
    header: "Region",
    cell: ({ getValue }) => getValue<string | undefined>() ?? "—",
  },
  { accessorKey: "average_price_score", header: "Price" },
  { accessorKey: "update_frequency_score", header: "Updates" },
  { accessorKey: "reliability_score", header: "Reliability" },
  { accessorKey: "delivery_score", header: "Delivery" },
  {
    accessorKey: "overall_score",
    header: "Overall",
    cell: ({ getValue }) => (
      <span className="font-bold text-primary">{getValue<number>().toFixed(1)}</span>
    ),
  },
];

function SupplierBenchmarkContent() {
  const [region, setRegion] = useState("All");
  const [category, setCategory] = useState("All");
  // No category field exists on SupplierBenchmark — options can't be honestly
  // derived from real data yet, so this stays a single disabled "All" option
  // until a categories endpoint is wired.
  const categoryOptions = useMemo(() => ["All"], []);

  const { data, isLoading, error, refetch } = useSupplierBenchmarks({ region, category });
  const rows = useMemo(() => data ?? [], [data]);

  const ranked = useMemo(
    () => [...rows].sort((a, b) => b.overall_score - a.overall_score),
    [rows]
  );

  const averages = useMemo(() => {
    if (rows.length === 0) return null;
    const result: Partial<Record<string, number>> = {};
    for (const { key } of SCORE_DIMENSIONS) {
      result[key] = rows.reduce((sum, r) => sum + (Number(r[key]) || 0), 0) / rows.length;
    }
    return result;
  }, [rows]);

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
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={categoryOptions.length <= 1}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
          >
            {categoryOptions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {categoryOptions.length <= 1 && (
          <span className="text-xs text-gray-400">Category filtering awaits a categories endpoint</span>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="mb-4 font-bold text-gray-900">Score Overview</p>
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={rows.length === 0}
          onRetry={refetch}
          emptyTitle="No supplier benchmark data yet"
          emptyHint="This section populates once /api/supplier-benchmarks returns records for the selected filters."
          minHeight={120}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {SCORE_DIMENSIONS.map(({ key, label }) => (
              <div key={key} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <p className="text-xs font-semibold text-gray-500">{label}</p>
                <p className="mt-1 text-xl font-extrabold text-gray-900">
                  {averages?.[key] !== undefined ? averages[key]!.toFixed(1) : "—"}
                </p>
              </div>
            ))}
          </div>
        </QueryState>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <p className="font-bold text-gray-900">Supplier Rankings</p>
          <span className="text-xs text-gray-400">
            {ranked.length} supplier{ranked.length !== 1 ? "s" : ""}
          </span>
        </div>
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={ranked.length === 0}
          onRetry={refetch}
          emptyTitle="No supplier benchmark data yet"
          emptyHint="This table renders live once /api/supplier-benchmarks is available."
          minHeight={220}
        >
          <DataTable
            columns={RANKING_COLUMNS}
            data={ranked}
            initialSorting={[{ id: "overall_score", desc: true }]}
          />
        </QueryState>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="mb-1 font-bold text-gray-900">Overall Score by Supplier</p>
        <p className="mb-4 text-xs text-gray-400">Higher is better</p>
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={ranked.length === 0}
          onRetry={refetch}
          emptyTitle="No data to chart yet"
          minHeight={260}
        >
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ranked.slice(0, 10)}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                <YAxis
                  type="category"
                  dataKey="supplier_name"
                  width={140}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Bar dataKey="overall_score" fill="#E07B39" radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </QueryState>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-gray-400" />
          <p className="font-bold text-gray-900">Recommendations</p>
        </div>
        <p className="text-sm text-gray-400">No recommendations available yet.</p>
        <p className="text-xs text-gray-300">
          Recommendations are generated by the backend and are not yet included in the API response.
        </p>
      </div>
    </div>
  );
}

export default function SupplierBenchmarkPage() {
  return (
    <RequireOnboardingStep minStep={2}>
      <SupplierBenchmarkContent />
    </RequireOnboardingStep>
  );
}
