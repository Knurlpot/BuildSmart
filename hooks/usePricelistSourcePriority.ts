// Assumed endpoints — UNVERIFIED, confirm with the backend team:
//   GET /api/pricelist/source-priority -> SourcePriorityEntry[]
//   PUT /api/pricelist/source-priority (body: SourcePriorityEntry[]) -> SourcePriorityEntry[]
//
// ⚠️ SCHEMA GAP, not just an unconfirmed path: there is no source-priority table in the
// authoritative 13-table SQL. Persisting a per-company source ranking needs a real column
// or table the backend team has to add — this hook (and its mock fixture) model the UI
// against a guessed shape so the page is reviewable, not a confirmed contract.
import { useState } from 'react';
import { useFetch } from './useFetch';
import { useMutation } from './useMutation';
import type { HistoricalPriceRecord } from '@/types/entities';

export interface SourcePriorityEntry {
  source: HistoricalPriceRecord['price_source'];
  rank: number; // 1 = highest priority
}

export function usePricelistSourcePriority() {
  const { data, isLoading, error, refetch } = useFetch<SourcePriorityEntry[]>('/api/pricelist/source-priority');
  const save = useMutation<SourcePriorityEntry[]>();
  const [order, setOrder] = useState<SourcePriorityEntry[] | null>(null);

  const list = order ?? data ?? [];

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next.map((entry, i) => ({ ...entry, rank: i + 1 })));
  };

  const saveOrder = () => save.mutate('/api/pricelist/source-priority', list, 'PUT');

  return {
    list,
    isLoading,
    error,
    refetch,
    move,
    isDirty: order !== null,
    saveOrder,
    isSaving: save.isLoading,
    saveError: save.error,
    saved: save.data,
  };
}
