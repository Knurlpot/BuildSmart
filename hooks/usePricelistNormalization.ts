// Talks to the FastAPI normalization backend directly, via its OWN base URL
// (NEXT_PUBLIC_NORMALIZATION_API_BASE_URL) rather than the shared apiClient's
// global NEXT_PUBLIC_API_BASE_URL — that global var is used by every other
// apiClient call in the app (auth, company, users, ...), all of which are
// same-origin Next.js routes. Pointing it at FastAPI broke those elsewhere;
// this hook deliberately doesn't touch apiClient or its env var.
import { useCallback, useEffect, useRef, useState } from 'react';

const NORMALIZATION_API_BASE =
  process.env.NEXT_PUBLIC_NORMALIZATION_API_BASE_URL?.replace(/\/$/, '') || '';

async function normalizationApiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${NORMALIZATION_API_BASE}${endpoint}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || body?.error || `API error: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface NormalizationSummary {
  processed: number;
  matched: number;
  new_items_created: number;
  needs_review: number;
}

export type NormalizationTaskStatus = 'pending' | 'processing' | 'done' | 'failed';

interface UploadResponse {
  task_id: string;
}

interface StatusResponse {
  status: NormalizationTaskStatus;
  result: NormalizationSummary | null;
}

export interface PricelistReviewItem {
  review_id: number;
  raw_name: string;
  raw_unit: string;
  raw_price: number;
  confidence: number;
  suggested_category_type: string | null;
  suggested_material: string | null;
  suggested_brand: string | null;
  source: string;
  supplier_id: number | null;
  status: string;
  created_at: string;
}

const POLL_INTERVAL_MS = 2000;

export function usePricelistNormalization() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<Error | null>(null);
  const [taskStatus, setTaskStatus] = useState<NormalizationTaskStatus | null>(null);
  const [result, setResult] = useState<NormalizationSummary | null>(null);
  const [pollError, setPollError] = useState<Error | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [reviewItems, setReviewItems] = useState<PricelistReviewItem[]>([]);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState<Error | null>(null);

  const refetchReview = useCallback(() => {
    setIsLoadingReview(true);
    setReviewError(null);
    // No `credentials: 'include'` — FastAPI's /pricelist routes have no cookie/session
    // auth to send (unlike the Next.js routes apiClient calls), and sending it forces
    // the browser to require Access-Control-Allow-Credentials on a backend that has
    // no reason to set it.
    normalizationApiClient<PricelistReviewItem[]>('/pricelist/review')
      .then(setReviewItems)
      .catch((err) => setReviewError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoadingReview(false));
  }, []);

  useEffect(() => {
    refetchReview();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [refetchReview]);

  const pollStatus = (taskId: string) => {
    normalizationApiClient<StatusResponse>(`/pricelist/status/${taskId}`)
      .then((res) => {
        setTaskStatus(res.status);
        if (res.status === 'done' || res.status === 'failed') {
          setResult(res.result);
          if (res.status === 'done') refetchReview();
          return;
        }
        pollTimer.current = setTimeout(() => pollStatus(taskId), POLL_INTERVAL_MS);
      })
      .catch((err) => setPollError(err instanceof Error ? err : new Error(String(err))));
  };

  const uploadFile = async (file: File, source: string, supplierId?: number) => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setIsUploading(true);
    setUploadError(null);
    setTaskStatus(null);
    setResult(null);
    setPollError(null);

    const form = new FormData();
    form.append('file', file);
    form.append('source', source);
    if (supplierId != null) form.append('supplier_id', String(supplierId));

    try {
      const res = await normalizationApiClient<UploadResponse>('/pricelist/upload', {
        method: 'POST',
        body: form,
      });
      setTaskStatus('pending');
      pollStatus(res.task_id);
      return res;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setUploadError(error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadFile,
    isUploading,
    uploadError,
    taskStatus,
    result,
    pollError,
    reviewItems,
    isLoadingReview,
    reviewError,
    refetchReview,
  };
}
