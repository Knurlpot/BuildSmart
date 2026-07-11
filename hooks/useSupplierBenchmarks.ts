// Assumed endpoint: GET /api/supplier-benchmarks?region=<region>&category=<category>
// UNVERIFIED — confirm with the backend team:
//   - exact path and query param names
//   - whether supplier_name/region come pre-joined (assumed here) or need a
//     separate GET /api/suppliers lookup joined client-side
//   - whether `category` is even a valid filter on this endpoint, since
//     SupplierBenchmark itself carries no category field — it would only
//     make sense as a filter the backend applies while joining Items/Categories
import { useMemo } from 'react';
import { useFetch, type UseFetchResult } from './useFetch';
import type { SupplierBenchmark } from '@/types/entities';

// Assumed enrichment beyond the raw SupplierBenchmark row — unconfirmed, see above.
export interface SupplierBenchmarkRow extends SupplierBenchmark {
  supplier_name?: string;
  region?: string;
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
