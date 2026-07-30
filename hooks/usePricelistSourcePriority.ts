import { useState } from 'react';
import { useFetch } from './useFetch';
import { useMutation } from './useMutation';
import type { HistoricalPriceRecord } from '@/types/entities';

export interface SourcePriorityEntry {
  price_source: HistoricalPriceRecord['price_source'];
  priority_rank: number; // 1 = highest priority
}

interface SourcePriorityResponse extends SourcePriorityEntry {
  priority_id: number | null;
  company_id: number;
}

export function usePricelistSourcePriority(companyId?: number) {
  const endpoint = companyId ? `/api/pricelist/source-priority/${companyId}` : null;
  const { data: rawData, isLoading, error, refetch } = useFetch<SourcePriorityResponse[]>(endpoint);
  const save = useMutation<SourcePriorityResponse[]>();
  const [order, setOrder] = useState<SourcePriorityEntry[] | null>(null);

  // Transform raw data to SourcePriorityEntry format
  const data = rawData?.map((item) => ({
    price_source: item.price_source,
    priority_rank: item.priority_rank,
  })) ?? [];

  const list = order ?? data ?? [];

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    reorder(index, target);
  };

  const reorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) {
      return;
    }
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setOrder(next.map((entry, i) => ({ ...entry, priority_rank: i + 1 })));
  };

  const saveOrder = async () => {
    if (!companyId) return;
    await save.mutate(
      `/api/pricelist/source-priority/${companyId}`,
      { priorities: list },
      'POST'
    );
  };

  return {
    list,
    isLoading,
    error,
    refetch,
    move,
    reorder,
    isDirty: order !== null,
    saveOrder,
    isSaving: save.isLoading,
    saveError: save.error,
    saved: save.data,
  };
}
