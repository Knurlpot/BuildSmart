// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Matches SupplierBenchmarkRow exactly
// (types/entities/supplier-benchmark.ts + the assumed join in
// hooks/useSupplierBenchmarks.ts), same field casing.
import type { SupplierBenchmarkRow } from "@/hooks/useSupplierBenchmarks";

export const supplierBenchmarksFixture: SupplierBenchmarkRow[] = [
  {
    benchmark_id: 1,
    supplier_id: 501,
    supplier_name: "Coastal Building Supply",
    region: "NCR",
    average_price_score: 82.4,
    update_frequency_score: 76.0,
    reliability_score: 91.2,
    delivery_score: 88.5,
    overall_score: 84.5,
  },
  {
    benchmark_id: 2,
    supplier_id: 502,
    supplier_name: "Northline Hardware Co.",
    region: "Region III",
    average_price_score: 74.1,
    update_frequency_score: 69.8,
    reliability_score: 80.3,
    delivery_score: 72.0,
    overall_score: 74.1,
  },
  {
    benchmark_id: 3,
    supplier_id: 503,
    supplier_name: "Terra Bright Materials",
    region: "CALABARZON",
    average_price_score: 90.6,
    update_frequency_score: 85.4,
    reliability_score: 77.9,
    delivery_score: 81.2,
    overall_score: 83.8,
  },
  {
    benchmark_id: 4,
    supplier_id: 504,
    supplier_name: "Pinnacle Construction Supply",
    region: "NCR",
    average_price_score: 65.3,
    update_frequency_score: 58.7,
    reliability_score: 70.4,
    delivery_score: 66.9,
    overall_score: 65.3,
  },
  {
    benchmark_id: 5,
    supplier_id: 505,
    supplier_name: "Harborview Trading Co.",
    region: "Region VII",
    average_price_score: 78.9,
    update_frequency_score: 82.1,
    reliability_score: 85.0,
    delivery_score: 79.4,
    overall_score: 81.4,
  },
];
