import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
// --- DEV MOCK (remove-safe) START ---
// See lib/dev/mock-toggle.ts for the full removal checklist and why this import (and
// its one call site below, also fenced) is safe in a production bundle.
import { tryResolveDevMock } from '@/lib/dev/mock-toggle';
// --- DEV MOCK (remove-safe) END ---

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

    // --- DEV MOCK (remove-safe) START ---
    // Dev-only fixture short-circuit for visual review without a backend.
    // tryResolveDevMock() is a no-op (returns undefined) in a production build — see
    // lib/dev/mock-toggle.ts for how that's actually verified, not just asserted.
    // The real fetch path directly below is unchanged.
    const mocked = tryResolveDevMock<T>(endpoint);
    if (mocked !== undefined) {
      // setState in a microtask callback, not synchronously in the effect body —
      // same rule this file's real fetch path already follows below.
      Promise.resolve().then(() => setResolved({ key, data: mocked, error: null }));
      return;
    }
    // --- DEV MOCK (remove-safe) END ---

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
