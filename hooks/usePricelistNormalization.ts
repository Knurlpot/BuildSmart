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
  result: NormalizationSummary | { error: string } | null;
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

// Mirrors pricelist_parser.py's REQUIRED_COLUMNS — the 3 fields the backend
// couldn't place in a file's headers via its exact/synonym/keyword tiers.
export type NormalizationField = 'raw_name' | 'raw_unit' | 'raw_price';

export const NORMALIZATION_FIELD_LABELS: Record<NormalizationField, string> = {
  raw_name: 'Material Name',
  raw_unit: 'Unit',
  raw_price: 'Price',
};

// What POST /pricelist/upload returns as a 422 when parse_pricelist_file()
// raises MissingColumnsError — everything ColumnMappingStep.tsx needs to let
// a human finish what the backend's tiers 1-3 couldn't.
export interface MissingColumnsInfo {
  uploadId: string;
  missingColumns: NormalizationField[];
  availableColumns: string[];
  detectedMapping: Partial<Record<NormalizationField, string>>;
  previewRows: Record<string, string>[];
}

class MissingColumnsApiError extends Error {
  info: MissingColumnsInfo;
  constructor(info: MissingColumnsInfo) {
    super('Price list file is missing required column(s)');
    this.info = info;
  }
}

async function uploadPricelistFile(form: FormData): Promise<UploadResponse> {
  const res = await fetch(`${NORMALIZATION_API_BASE}/pricelist/upload`, { method: 'POST', body: form });

  if (res.status === 422) {
    const body = await res.json().catch(() => null);
    if (body && typeof body.upload_id === 'string' && Array.isArray(body.missing_columns)) {
      throw new MissingColumnsApiError({
        uploadId: body.upload_id,
        missingColumns: body.missing_columns,
        availableColumns: body.available_columns ?? [],
        detectedMapping: body.detected_mapping ?? {},
        previewRows: body.preview_rows ?? [],
      });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || body?.error || `API error: ${res.status}`);
  }
  return res.json();
}

// The backend processes one file per task (POST /pricelist/upload takes a
// single UploadFile) — multi-file support is a client-side queue on top of
// that, uploaded one at a time rather than concurrently. Sequential matters
// most for AI Match: several files firing rate-limited Gemini calls at once
// would just make each other wait anyway, so there's no throughput to gain
// and it'd make the adaptive pacing in normalizer_gemini.py harder to reason
// about (multiple call sites racing to update the same shared interval). It
// also means at most one file can be sitting in 'needs_mapping' at a time —
// the queue pauses there until a human resolves or cancels it.
export type QueueItemStatus = 'queued' | 'uploading' | 'needs_mapping' | NormalizationTaskStatus;

export interface QueueItem {
  id: string;
  file: File;
  // Captured per-file at enqueue time (not passed as loop-level params) so
  // that changing "Matching Mode" while an earlier batch is still processing
  // can't silently leak into files added afterward.
  source: string;
  useAi: boolean;
  status: QueueItemStatus;
  taskId?: string;
  result?: NormalizationSummary;
  failureReason?: string;
  mappingInfo?: MissingColumnsInfo;
}

const POLL_INTERVAL_MS = 2000;

export function usePricelistNormalization() {
  const queueRef = useRef<QueueItem[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const processingRef = useRef(false);

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
  }, [refetchReview]);

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    queueRef.current = queueRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item));
    setQueue([...queueRef.current]);
  };

  const pollTaskStatus = (itemId: string, taskId: string): Promise<void> =>
    new Promise((resolve) => {
      const poll = () => {
        normalizationApiClient<StatusResponse>(`/pricelist/status/${taskId}`)
          .then((res) => {
            if (res.status === 'done') {
              updateItem(itemId, { status: 'done', result: res.result as NormalizationSummary });
              resolve();
            } else if (res.status === 'failed') {
              const reason = res.result && 'error' in res.result ? res.result.error : undefined;
              updateItem(itemId, { status: 'failed', failureReason: reason });
              resolve();
            } else {
              updateItem(itemId, { status: res.status });
              setTimeout(poll, POLL_INTERVAL_MS);
            }
          })
          .catch((err) => {
            updateItem(itemId, {
              status: 'failed',
              failureReason: err instanceof Error ? err.message : String(err),
            });
            resolve();
          });
      };
      poll();
    });

  const processQueue = async () => {
    if (processingRef.current) return;
    // A file awaiting a human-confirmed mapping blocks the rest of the batch
    // — resuming here would let a later file's Quick/AI Match run ahead of a
    // decision the user hasn't made yet, out of the upload order they expect.
    if (queueRef.current.some((item) => item.status === 'needs_mapping')) return;
    processingRef.current = true;

    while (true) {
      const next = queueRef.current.find((item) => item.status === 'queued');
      if (!next) break;

      updateItem(next.id, { status: 'uploading' });

      const form = new FormData();
      form.append('file', next.file);
      form.append('source', next.source);
      // Backend's use_mock is the inverse of the UI's "AI Match" choice.
      form.append('use_mock', String(!next.useAi));

      try {
        const res = await uploadPricelistFile(form);
        updateItem(next.id, { status: 'pending', taskId: res.task_id });
        await pollTaskStatus(next.id, res.task_id);
        refetchReview();
      } catch (err) {
        if (err instanceof MissingColumnsApiError) {
          updateItem(next.id, { status: 'needs_mapping', mappingInfo: err.info });
          break; // pause here — see the guard above for why
        }
        updateItem(next.id, {
          status: 'failed',
          failureReason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    processingRef.current = false;
  };

  const enqueueFiles = (files: File[], source: string, useAi: boolean) => {
    const newItems: QueueItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      source,
      useAi,
      status: 'queued',
    }));
    queueRef.current = [...queueRef.current, ...newItems];
    setQueue([...queueRef.current]);
    processQueue().catch(() => {});
  };

  // Submits the human-confirmed mapping from ColumnMappingStep.tsx for an
  // item stuck in 'needs_mapping', then resumes the rest of the queue
  // regardless of whether this file itself succeeds or fails.
  const resolveColumnMapping = async (itemId: string, mapping: Record<NormalizationField, string>) => {
    const item = queueRef.current.find((i) => i.id === itemId);
    if (!item?.mappingInfo) return;

    updateItem(itemId, { status: 'uploading' });

    const form = new FormData();
    form.append('raw_name_column', mapping.raw_name);
    form.append('raw_unit_column', mapping.raw_unit);
    form.append('raw_price_column', mapping.raw_price);
    form.append('source', item.source);
    form.append('use_mock', String(!item.useAi));

    try {
      const res = await normalizationApiClient<UploadResponse>(
        `/pricelist/upload/${item.mappingInfo.uploadId}/confirm-mapping`,
        { method: 'POST', body: form }
      );
      updateItem(itemId, { status: 'pending', taskId: res.task_id, mappingInfo: undefined });
      await pollTaskStatus(itemId, res.task_id);
      refetchReview();
    } catch (err) {
      updateItem(itemId, {
        status: 'failed',
        failureReason: err instanceof Error ? err.message : String(err),
        mappingInfo: undefined,
      });
    }

    processQueue().catch(() => {});
  };

  // Backs out of a 'needs_mapping' file without submitting a mapping —
  // drops it from the queue and unblocks whatever's queued behind it.
  const cancelColumnMapping = (itemId: string) => {
    queueRef.current = queueRef.current.filter((item) => item.id !== itemId);
    setQueue([...queueRef.current]);
    processQueue().catch(() => {});
  };

  const clearFinishedQueueItems = () => {
    queueRef.current = queueRef.current.filter(
      (item) => item.status !== 'done' && item.status !== 'failed'
    );
    setQueue([...queueRef.current]);
  };

  const [isClearingReview, setIsClearingReview] = useState(false);
  const [clearReviewError, setClearReviewError] = useState<Error | null>(null);

  // Permanently deletes every currently-Pending review row (DELETE
  // /pricelist/review, scoped server-side to status == "Pending" — see
  // clear_pending_review in pricelist.py). Irreversible: there's no
  // approve/reject workflow yet for these rows to have been acted on first.
  const clearPendingReview = async () => {
    setIsClearingReview(true);
    setClearReviewError(null);
    try {
      await normalizationApiClient<{ deleted_count: number }>('/pricelist/review', { method: 'DELETE' });
      setReviewItems([]);
    } catch (err) {
      setClearReviewError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsClearingReview(false);
    }
  };

  return {
    queue,
    enqueueFiles,
    resolveColumnMapping,
    cancelColumnMapping,
    clearFinishedQueueItems,
    reviewItems,
    isLoadingReview,
    reviewError,
    refetchReview,
    clearPendingReview,
    isClearingReview,
    clearReviewError,
  };
}
