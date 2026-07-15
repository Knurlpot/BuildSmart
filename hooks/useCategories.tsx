import { useFetch } from './useFetch';
import type { Category, CategoryType } from '@/types/entities/category';

export function useCategories() {
  const { data, isLoading, error, refetch } = useFetch<Category[]>('/api/categories');
  const categories = data ?? [];
  return {
    categories,
    isLoading,
    error,
    refetch,
    categoryIdFor: (type: CategoryType): number | null =>
      categories.find((c) => c.category_type === type)?.category_id ?? null,
  };
}