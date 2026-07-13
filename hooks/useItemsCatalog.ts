// Assumed endpoint — UNVERIFIED, confirm with the backend team:
//   GET /api/items -> Items[]
//
// The company's own catalog (its uploaded/committed pricelist items, plus any DPWH/PSA
// reference items visible to it). Used wherever a rule must reference a specific catalog
// item rather than free text — Material Rules' preferred_item_code and Unit Rules'
// item_code (both FKs to items.item_code in the v5 schema). `Items` itself is the
// confirmed schema entity (types/entities/items.ts); only this endpoint path is a guess.
import { useMemo } from 'react';
import { useFetch } from './useFetch';
import type { Items } from '@/types/entities/items';
import type { CategoryType } from '@/types/entities/category';
import { useCategories } from './useCategories';

export function useItemsCatalog() {
  const { data, isLoading, error, refetch } = useFetch<Items[]>('/api/items');
  const { categoryIdFor } = useCategories();
  const items = useMemo(() => data ?? [], [data]);

  const itemsInCategory = (category: CategoryType): Items[] => {
    const categoryId = categoryIdFor(category);
    if (categoryId === null) return [];
    return items.filter((i) => i.category_id === categoryId);
  };

  return { items, isLoading, error, refetch, itemsInCategory };
}
