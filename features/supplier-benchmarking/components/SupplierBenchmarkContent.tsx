"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Filter, PackageSearch, Search, TrendingDown } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { useFetch } from "@/hooks/useFetch";
import type { SavedPriceRecord } from "@/hooks/usePricelistCatalog";
import { REGIONS } from "@/lib/regions";

type MaterialComparison = {
  key: string;
  itemName: string;
  category: string;
  unit: string;
  offers: SavedPriceRecord[];
};

function fmt(n: number) {
  return "PHP " + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function materialKey(row: SavedPriceRecord) {
  return [row.item_name.trim().toLowerCase(), row.unit.trim().toLowerCase(), row.category_type ?? ""].join("|");
}

function sortCategoryOptions(options: string[]) {
  return [...options].sort((a, b) => {
    if (a === "Others") return 1;
    if (b === "Others") return -1;
    return a.localeCompare(b);
  });
}

export function SupplierBenchmarkContent() {
  const [region, setRegion] = useState("All");
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useFetch<SavedPriceRecord[]>("/api/pricelist/catalog");
  const rows = useMemo(() => data ?? [], [data]);

  const categoryOptions = useMemo(
    () => sortCategoryOptions(Array.from(new Set(rows.map((row) => row.category_type ?? "Uncategorized")))),
    [rows]
  );

  const comparisons = useMemo<MaterialComparison[]>(() => {
    const needle = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const matchesRegion = region === "All" || row.region === region;
      const rowCategory = row.category_type ?? "Uncategorized";
      const matchesCategory = category === "All" || rowCategory === category;
      const text = `${row.item_name} ${row.supplier_name ?? ""} ${row.brand} ${row.description_material}`.toLowerCase();
      return matchesRegion && matchesCategory && (!needle || text.includes(needle));
    });

    const grouped = new Map<string, SavedPriceRecord[]>();
    for (const row of filtered) {
      const key = materialKey(row);
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }

    return Array.from(grouped.entries())
      .map(([key, offers]) => {
        const sortedOffers = [...offers].sort((a, b) => a.price - b.price);
        const first = sortedOffers[0];
        return {
          key,
          itemName: first.item_name,
          category: first.category_type ?? "Uncategorized",
          unit: first.unit,
          offers: sortedOffers,
        };
      })
      .sort((a, b) => b.offers.length - a.offers.length || a.itemName.localeCompare(b.itemName));
  }, [rows, region, category, search]);

  const selected = useMemo(() => {
    if (comparisons.length === 0) return null;
    return comparisons.find((item) => item.key === selectedKey) ?? comparisons[0];
  }, [comparisons, selectedKey]);

  const supplierCount = selected ? new Set(selected.offers.map((offer) => offer.supplier_name ?? "Unassigned")).size : 0;
  const cheapest = selected?.offers[0] ?? null;
  const highest = selected?.offers[selected.offers.length - 1] ?? null;
  const savings = cheapest && highest ? highest.price - cheapest.price : 0;
  const savingsPercent = cheapest && highest && highest.price > 0 ? (savings / highest.price) * 100 : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search material or supplier..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
          />
        </div>
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
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          >
            <option>All</option>
            {categoryOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error}
        isEmpty={comparisons.length === 0}
        onRetry={refetch}
        emptyTitle="No supplier prices to compare yet"
        emptyHint="Upload and approve supplier pricelists with matching materials to compare supplier offers."
        minHeight={320}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="font-bold text-gray-900">Materials</p>
              <p className="text-xs text-gray-400">
                {comparisons.length} material{comparisons.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {comparisons.map((item) => {
                const active = selected?.key === item.key;
                const best = item.offers[0];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedKey(item.key)}
                    className={`block w-full border-b border-gray-50 px-4 py-3 text-left transition last:border-b-0 ${
                      active ? "bg-orange-50/70" : "hover:bg-gray-50"
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{item.itemName}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.offers.length} offer{item.offers.length !== 1 ? "s" : ""} | {item.unit} | {item.category}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-primary">Lowest: {fmt(best.price)}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Material Comparison</p>
                  <h2 className="mt-1 text-xl font-bold text-gray-900">{selected?.itemName}</h2>
                  <p className="text-sm text-gray-500">
                    {selected?.category} | {selected?.unit}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-right">
                  <div>
                    <p className="text-xs text-gray-400">Suppliers</p>
                    <p className="text-lg font-bold text-gray-900">{supplierCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Best Price</p>
                    <p className="text-lg font-bold text-primary">{cheapest ? fmt(cheapest.price) : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Savings</p>
                    <p className="text-lg font-bold text-green-600">{fmt(Math.max(0, savings))}</p>
                  </div>
                </div>
              </div>

              {selected && selected.offers.length > 1 && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
                  <TrendingDown className="h-4 w-4" />
                  Choosing {cheapest?.supplier_name ?? "the lowest supplier"} saves {savingsPercent.toFixed(1)}% versus the highest offer.
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-3">
                <p className="font-bold text-gray-900">Supplier Offers</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-5 py-3">Rank</th>
                      <th className="w-[28%] px-5 py-3">Supplier</th>
                      <th className="w-[18%] px-5 py-3">Brand</th>
                      <th className="w-[18%] px-5 py-3">Location</th>
                      <th className="px-5 py-3">Price</th>
                      <th className="px-5 py-3">Gap</th>
                      <th className="px-5 py-3">Effective</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selected?.offers.map((offer, index) => {
                      const gap = cheapest ? offer.price - cheapest.price : 0;
                      const gapPercent = cheapest && cheapest.price > 0 ? (gap / cheapest.price) * 100 : 0;
                      return (
                        <tr key={offer.historicalrec_id}>
                          <td className="px-5 py-3 text-gray-500">#{index + 1}</td>
                          <td className="w-[28%] px-5 py-3 align-top">
                            <p className="font-semibold text-gray-900">{offer.supplier_name ?? "Unassigned"}</p>
                            <p className="text-xs text-gray-400">{offer.region}</p>
                          </td>
                          <td className="w-[18%] px-5 py-3 align-top text-gray-600">{offer.brand || "-"}</td>
                          <td className="w-[18%] px-5 py-3 align-top text-gray-600">{offer.supplier_location || "-"}</td>
                          <td className="px-5 py-3 font-bold text-gray-900">{fmt(offer.price)}</td>
                          <td className="px-5 py-3">
                            {index === 0 ? (
                              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">Lowest</span>
                            ) : (
                              <span className="text-gray-500">
                                +{fmt(gap)} ({gapPercent.toFixed(1)}%)
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-gray-500">
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock className="h-3.5 w-3.5" />
                              {formatDate(offer.effective_date)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {selected?.offers.length === 1 && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">
                <div className="flex items-center gap-2">
                  <PackageSearch className="h-4 w-4" />
                  This material has one supplier offer. Upload another supplier pricelist with the same material to compare prices.
                </div>
              </div>
            )}
          </div>
        </div>
      </QueryState>
    </div>
  );
}
