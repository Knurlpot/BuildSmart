// Assumed endpoint — UNVERIFIED, confirm with the backend team:
//   GET /api/categories -> Category[]
//
// `category` itself is a confirmed, already-existing reference table (schema v3/v4/v5,
// unchanged) — only this specific endpoint path is a guess. Needed wherever a rule has to
// resolve a CategoryType (the string enum the UI filters/displays by) to the real
// category_id an FK column actually stores (rule_material.category_id, rule_unit.category_id).
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
