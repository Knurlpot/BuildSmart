// Assumed endpoints — UNVERIFIED, confirm with the backend team:
//   POST /api/pricelist/fetch-published
//        Removed. DPWH CMPD web scraping is intentionally disabled; use the
//        upload/matching flow for DPWH release files instead.
//   POST /api/pricelist/deviations/resolve
//        (body: { item_code, quarter, year, action: 'approve'|'reject' }) -> { resolved: boolean }
//   POST /api/pricelist/deviations/resolve-bulk
//        (body: { items: { item_code, quarter, year }[], action: 'approve'|'reject' })
//        -> { resolved_count: number }
//        A real flagged-deviation fetch can return hundreds/thousands of rows — bulk
//        resolve applies one action to a whole selection in a single request, not N
//        single-item requests.
//   POST /api/pricelist/fetch-published-index (NCR only — no region param, PSA has none)
//        -> { index: PsaIndexEntry[] }
//        PSA (CMWPI/CMRPI) publishes commodity-group INDEX movement, not per-item peso
//        prices — there is nothing here to "approve into the catalog." This is a
//        read-only fetch: no resolve/commit action exists or should be added for it.
//   GET /api/pricelist/catalog/dpwh -> DpwhCatalogRow[]
//        Read-only DPWH catalog preview, shown after the user resolves flagged deviations.
//        A distinct endpoint from Upload Pricelist's /api/pricelist/catalog (that one is
//        the Supplier-upload catalog; this is DPWH-sourced) — do not conflate the two.
//   POST /api/pricelist/check-version?source=DPWH|PSA (body: { source: 'DPWH'|'PSA', region })
//        -> { status: 'up_to_date' | 'new_available', release_label: string }
//        A BACKEND determination — the backend checks the published source's latest release
//        against what's already reflected in the catalog/index; the frontend only renders
//        whichever state comes back, it never decides this itself. Gates whether the
//        deviation-review flow (DPWH) / index refresh (PSA) proceeds — see `checkVersion`.
//
// Accessing the published source, AI extraction/normalization, and version comparison are
// entirely backend work — this hook only triggers the fetch and renders whatever comes
// back, then posts the user's approve/reject decision per flagged item (or per selection).
//
// `FlaggedPriceDeviation` is a FRONTEND STAGING shape describing an old-vs-new comparison
// for the review UI, not a historical_price_record mirror. DPWH-only now — PSA never had
// real peso deviations, that was fabricated mock data and has been removed.
import { useCallback, useState } from 'react';
import type { HistoricalPriceRecord, MaterialPriceVariance } from '@/types/entities';
import { useFetch } from './useFetch';
import { useMutation } from './useMutation';

const BACKEND_API_BASE = process.env.NEXT_PUBLIC_NORMALIZATION_API_BASE_URL?.replace(/\/$/, '') || '';

function formatApiErrorDetail(detail: unknown): string | null {
  if (!detail) return null;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          const path = 'loc' in item && Array.isArray(item.loc) ? `${item.loc.join('.')}: ` : '';
          return `${path}${String(item.msg)}`;
        }
        return JSON.stringify(item);
      })
      .join('; ');
  }
  if (typeof detail === 'object' && 'message' in detail) return String(detail.message);
  return JSON.stringify(detail);
}

async function backendApiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND_API_BASE}${endpoint}`, {
    mode: 'cors',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(formatApiErrorDetail(body?.detail) || formatApiErrorDetail(body?.error) || `API error: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

interface MutationState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
}

function useBackendMutation<T = unknown>() {
  const [state, setState] = useState<MutationState<T>>({ data: null, error: null, isLoading: false });

  const mutate = useCallback(async (endpoint: string, body: unknown, method: 'PATCH' | 'POST' | 'PUT' | 'DELETE' = 'PATCH') => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
          const result = await backendApiClient<T>(endpoint, {
        method,
        headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
        body: isFormData ? (body as FormData) : JSON.stringify(body),
      });
      setState({ data: result, error: null, isLoading: false });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ data: null, error, isLoading: false });
      throw error;
    }
  }, []);

  const reset = useCallback(() => setState({ data: null, error: null, isLoading: false }), []);

  return { ...state, mutate, reset };
}

export interface FlaggedPriceDeviation {
  item_code: number;
  item_name?: string;
  region: string;
  quarter: NonNullable<HistoricalPriceRecord['quarter']>;
  year: number;
  previous_price: number;
  new_price: number;
  percent_change: number;
  source: 'DPWH';
}

export interface FetchPublishedResponse {
  auto_saved_count: number;
  flagged: FlaggedPriceDeviation[];
}

export interface BulkResolveResponse {
  resolved_count: number;
}

/**
 * PSA commodity-group index movement — the same variance_source='PSA' shape as
 * material-price-variance.ts (commodity_group set, item_code null, NCR only), plus
 * `index_value`: an ASSUMED enrichment. material_price_variance has NO index_value
 * column in schema v3 — only percent_change (YoY %). Whether the backend can actually
 * join/derive an absolute index number is unconfirmed; render it only when present,
 * never fabricate one. percent_change is the one confirmed, always-present field.
 */
export interface PsaIndexEntry extends Pick<MaterialPriceVariance, 'commodity_group' | 'quarter' | 'year' | 'percent_change' | 'trend_direction' | 'is_significant_spike'> {
  index_value?: number;
}

export interface PsaIndexResponse {
  index: PsaIndexEntry[];
}

interface MaterialPriceVarianceApiRow extends PsaIndexEntry {
  variance_source: 'Internal' | 'PSA';
}

/** Read-only DPWH catalog row — current committed price, not a deviation comparison. */
export interface DpwhCatalogRow {
  historicalrec_id: number;
  item_code: number;
  item_name?: string; // assumed enrichment — unconfirmed, see historical-price-record.ts
  category_type?: string | null;
  region: string;
  location?: string | null;
  effective_date: string;
  quarter: NonNullable<HistoricalPriceRecord['quarter']>;
  year: number;
  price: number;
}

/**
 * Highlight outcome for a catalog row, computed CLIENT-SIDE from this session's actual
 * resolution — never a guessed/computed spike. 'kept' (user chose Keep Previous) renders
 * plain, same as a row with no resolution at all this fetch; only 'increased'/'decreased'
 * get a color, and only because the user's own approve action committed a different price.
 */
export type ResolutionOutcome = 'increased' | 'decreased' | 'kept';

export type VersionStatus = 'up_to_date' | 'new_available';

export interface VersionCheckResponse {
  status: VersionStatus;
  /** Human-readable release label, e.g. "2nd Sem 2025" (DPWH) or "May 2026" (PSA). */
  release_label: string;
}

/** Stable identity for a flagged deviation — matches the DeviationCard/table row key. */
export function deviationKey(item: Pick<FlaggedPriceDeviation, 'item_code' | 'quarter' | 'year'>): string {
  return `${item.item_code}-${item.quarter}-${item.year}`;
}

function outcomeOf(item: FlaggedPriceDeviation, action: 'approve' | 'reject'): ResolutionOutcome {
  if (action === 'reject') return 'kept';
  if (item.new_price > item.previous_price) return 'increased';
  if (item.new_price < item.previous_price) return 'decreased';
  return 'kept';
}

export function usePricelistPublishedSource() {
  const [flagged, setFlagged] = useState<FlaggedPriceDeviation[]>([]);
  // Keyed by deviationKey — outcomes from THIS fetch only, reset whenever a new DPWH
  // fetch is triggered (see `trigger` below) so stale highlights never linger.
  const [resolutions, setResolutions] = useState<Map<string, ResolutionOutcome>>(new Map());
  const fetchPublished = useBackendMutation<FetchPublishedResponse>();
  const resolveDeviation = useBackendMutation<{ resolved: boolean }>();
  const resolveBulk = useBackendMutation<BulkResolveResponse>();
  const [psaIndexState, setPsaIndexState] = useState<MutationState<PsaIndexResponse>>({
    data: null,
    error: null,
    isLoading: false,
  });
  const [catalogEnabled, setCatalogEnabled] = useState(false);
  const dpwhCatalog = useFetch<DpwhCatalogRow[]>(catalogEnabled ? '/api/pricelist/catalog/dpwh' : null);
  const loadDpwhCatalog = useCallback(() => setCatalogEnabled(true), []);
  const deleteDpwhRecord = useMutation<{ deleted: boolean }>();
  const resolveDeviationMutate = resolveDeviation.mutate;
  const resolveBulkMutate = resolveBulk.mutate;
  const deleteDpwhRecordMutate = deleteDpwhRecord.mutate;
  const fetchPublishedReset = fetchPublished.reset;
  const dpwhCatalogRefetch = dpwhCatalog.refetch;
  // Deletes just this one price record (see the endpoint's own scoping to
  // price_source == "DPWH") — the underlying item and its other price
  // history are untouched.
  const removeDpwhCatalogRecord = useCallback(async (historicalrecId: number) => {
    await deleteDpwhRecordMutate(`/api/pricelist/catalog/dpwh/${historicalrecId}`, undefined, 'DELETE');
    dpwhCatalogRefetch();
  }, [deleteDpwhRecordMutate, dpwhCatalogRefetch]);
  // Separate instances (not one shared mutation) so DPWH's and PSA's loading/error/result
  // state never bleed into each other when the user switches source.
  const checkDpwhVersion = useBackendMutation<VersionCheckResponse>();
  const checkDpwhVersionMutate = checkDpwhVersion.mutate;

  const trigger = useCallback(async (region?: string) => {
    void region;
    setResolutions(new Map());
    setFlagged([]);
    fetchPublishedReset();
    throw new Error('DPWH CMPD scraping has been removed. Upload DPWH releases manually instead.');
  }, [fetchPublishedReset]);

  const resolve = useCallback(async (item: FlaggedPriceDeviation, action: 'approve' | 'reject') => {
    await resolveDeviationMutate(
      '/pricelist/deviations/resolve',
      { item_code: item.item_code, quarter: item.quarter, year: item.year, action },
      'POST'
    );
    setResolutions((prev) => new Map(prev).set(deviationKey(item), outcomeOf(item, action)));
    setFlagged((prev) => prev.filter((f) => deviationKey(f) !== deviationKey(item)));
  }, [resolveDeviationMutate]);

  const resolveMany = useCallback(async (items: FlaggedPriceDeviation[], action: 'approve' | 'reject') => {
    const keys = items.map((i) => ({ item_code: i.item_code, quarter: i.quarter, year: i.year }));
    const res = await resolveBulkMutate('/pricelist/deviations/resolve-bulk', { items: keys, action }, 'POST');
    setResolutions((prev) => {
      const next = new Map(prev);
      for (const item of items) next.set(deviationKey(item), outcomeOf(item, action));
      return next;
    });
    const resolvedKeys = new Set(items.map(deviationKey));
    setFlagged((prev) => prev.filter((f) => !resolvedKeys.has(deviationKey(f))));
    return res;
  }, [resolveBulkMutate]);

  const triggerPsaIndex = useCallback(async () => {
    setPsaIndexState({ data: null, error: null, isLoading: true });
    try {
      const res = await fetch('/api/material-price-variances', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(formatApiErrorDetail(body?.detail) || formatApiErrorDetail(body?.error) || `API error: ${res.status}`);
      }
      const rows = (await res.json()) as MaterialPriceVarianceApiRow[];
      const result = { index: rows.filter((row) => row.variance_source === 'PSA') };
      setPsaIndexState({ data: result, error: null, isLoading: false });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setPsaIndexState({ data: null, error, isLoading: false });
      throw error;
    }
  }, []);

  const checkDpwhPublishedVersion = useCallback(
    (region: string) => checkDpwhVersionMutate('/pricelist/check-version', { source: 'DPWH', region }, 'POST'),
    [checkDpwhVersionMutate]
  );

  return {
    trigger,
    isFetching: fetchPublished.isLoading,
    fetchError: fetchPublished.error,
    result: fetchPublished.data,
    flagged,
    resolve,
    isResolving: resolveDeviation.isLoading,
    resolveError: resolveDeviation.error,
    resolveMany,
    isResolvingBulk: resolveBulk.isLoading,
    resolveBulkError: resolveBulk.error,
    resolutions,
    triggerPsaIndex,
    isFetchingPsaIndex: psaIndexState.isLoading,
    fetchPsaIndexError: psaIndexState.error,
    psaIndex: psaIndexState.data?.index ?? [],
    psaIndexResult: psaIndexState.data,
    checkDpwhVersion: checkDpwhPublishedVersion,
    isCheckingDpwhVersion: checkDpwhVersion.isLoading,
    checkDpwhVersionError: checkDpwhVersion.error,
    dpwhVersionResult: checkDpwhVersion.data,
    dpwhCatalog: {
      records: dpwhCatalog.data ?? [],
      isLoading: dpwhCatalog.isLoading,
      error: dpwhCatalog.error,
      refetch: dpwhCatalog.refetch,
      load: loadDpwhCatalog,
      remove: removeDpwhCatalogRecord,
      isRemoving: deleteDpwhRecord.isLoading,
      removeError: deleteDpwhRecord.error,
    },
  };
}
