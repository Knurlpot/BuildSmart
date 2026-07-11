import { useState } from 'react';
import { apiClient } from '@/lib/api/client';
// --- DEV MOCK (remove-safe) START ---
// See lib/dev/mock-toggle.ts for the full removal checklist and why this import (and
// its one call site below, also fenced) is safe in a production bundle.
import { tryResolveDevMock } from '@/lib/dev/mock-toggle';
// --- DEV MOCK (remove-safe) END ---

interface MutationState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
}

export interface UseMutationResult<T> extends MutationState<T> {
  mutate: (endpoint: string, body: unknown, method?: 'PATCH' | 'POST' | 'PUT') => Promise<T>;
  reset: () => void;
}

/**
 * Write-path complement to useFetch: no fabricated success — `data` only
 * populates from a real response, `error` surfaces exactly what the request
 * failed with. Endpoint is passed per-call (not bound at hook creation) so a
 * single instance can serve multiple rows/targets, e.g. an actions column.
 *
 * `body` may be a `FormData` (for file uploads) — in that case it's sent as-is,
 * with no `Content-Type` header, so the browser can set the multipart boundary.
 * Anything else is JSON-encoded, as before.
 */
export function useMutation<T = unknown>(): UseMutationResult<T> {
  const [state, setState] = useState<MutationState<T>>({ data: null, error: null, isLoading: false });

  const mutate = async (endpoint: string, body: unknown, method: 'PATCH' | 'POST' | 'PUT' = 'PATCH') => {
    setState({ data: null, error: null, isLoading: true });
    try {
      // --- DEV MOCK (remove-safe) START ---
      // Dev-only fixture short-circuit for visual review without a backend.
      // tryResolveDevMock() is a no-op (returns undefined) in a production build — see
      // lib/dev/mock-toggle.ts for how that's actually verified, not just asserted.
      // The real request path directly below is unchanged.
      const mocked = tryResolveDevMock<T>(endpoint);
      if (mocked !== undefined) {
        // Deferred to a microtask, not resolved synchronously, so callers awaiting
        // `mutate()` see the same async shape they'd get from a real request.
        const result = await Promise.resolve(mocked);
        setState({ data: result, error: null, isLoading: false });
        return result;
      }
      // --- DEV MOCK (remove-safe) END ---

      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      const result = await apiClient<T>(endpoint, {
        method,
        headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: isFormData ? (body as FormData) : JSON.stringify(body),
      });
      setState({ data: result, error: null, isLoading: false });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ data: null, error, isLoading: false });
      throw error;
    }
  };

  const reset = () => setState({ data: null, error: null, isLoading: false });

  return { ...state, mutate, reset };
}
