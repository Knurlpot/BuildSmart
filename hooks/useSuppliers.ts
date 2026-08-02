// Assumed endpoint — UNVERIFIED, confirm with the backend team: GET /api/suppliers.
// `Suppliers` is a real, confirmed entity (schema v3) — see types/entities/suppliers.ts.
// Backs the supplier picker in CPRM's Supplier Rules tab (SupplierRulesForm.tsx).
import { useFetch } from './useFetch';
import type { Suppliers } from '@/types/entities';

export function useSuppliers() {
  const { data, isLoading, error, refetch } = useFetch<Suppliers[]>('/api/suppliers');
  return { suppliers: data ?? [], isLoading, error, refetch };
}
