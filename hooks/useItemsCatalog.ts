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