// GET /api/supplier-benchmarks?region=<region>&category=<category>
// Returns supplier score fields from suppliers, enriched with supplier_name and region.
// Category filtering is applied server-side through supplier price records when provided.
import { useMemo } from 'react';
import { useFetch, type UseFetchResult } from './useFetch';
import type { SupplierBenchmark } from '@/types/entities';

export interface SupplierBenchmarkRow extends SupplierBenchmark {
  supplier_name: string;
  region: string;
}

export interface UseSupplierBenchmarksParams {
  region?: string;
  category?: string;
}

export function useSupplierBenchmarks(
  { region, category }: UseSupplierBenchmarksParams = {}
): UseFetchResult<SupplierBenchmarkRow[]> {
  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (region && region !== 'All') params.set('region', region);
    if (category && category !== 'All') params.set('category', category);
    const qs = params.toString();
    return `/api/supplier-benchmarks${qs ? `?${qs}` : ''}`;
  }, [region, category]);

  return useFetch<SupplierBenchmarkRow[]>(endpoint);
}
