import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';

export interface UseFetchResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface Resolved<T> {
  key: string;
  data: T | null;
  error: Error | null;
}

/**
 * Thin fetch wrapper: loading/error/data state, aborts the in-flight request on
 * unmount or when `endpoint` changes, and always sends credentials for session
 * auth. Pass `null` for `endpoint` to skip fetching (e.g. while dependent
 * filters are still resolving).
 *
 * `isLoading` is derived by comparing the current request's key against the
 * key of the last-resolved response, rather than set imperatively in the
 * effect body — setState belongs in the async callback, not synchronously in
 * the effect itself.
 */
export function useFetch<T>(endpoint: string | null): UseFetchResult<T> {
  const [resolved, setResolved] = useState<Resolved<T>>({ key: '', data: null, error: null });
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = () => setReloadToken((t) => t + 1);
  const requestKey = endpoint ? `${endpoint}::${reloadToken}` : '';

  useEffect(() => {
    if (!endpoint) return;
    const key = `${endpoint}::${reloadToken}`;

    const controller = new AbortController();

    apiClient<T>(endpoint, { credentials: 'include', signal: controller.signal })
      .then((data) => setResolved({ key, data, error: null }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResolved({ key, data: null, error: err instanceof Error ? err : new Error(String(err)) });
      });

    return () => controller.abort();
  }, [endpoint, reloadToken]);

  if (!endpoint) {
    return { data: null, isLoading: false, error: null, refetch };
  }

  const isLoading = resolved.key !== requestKey;
  return {
    data: isLoading ? null : resolved.data,
    isLoading,
    error: isLoading ? null : resolved.error,
    refetch,
  };
}
