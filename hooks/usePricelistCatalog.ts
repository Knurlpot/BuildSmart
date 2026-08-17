// Assumed endpoint — UNVERIFIED, confirm with the backend team:
//   GET /api/pricelist/catalog -> SavedPriceRecord[]
//
// Backs the read-only "View Catalog" screen shown after a successful upload commit.
// Plain listing only — no change/variance highlighting here. Whether the backend computes
// material_price_variances for freshly-committed rows, and whether a second upload of the
// same material is even treated as an "update" vs a new record, are both unconfirmed — so
// this view does not attempt to diff or badge anything as changed/new/spiked.
import { useCallback, useState } from 'react';
import { useFetch } from './useFetch';
import { useMutation } from './useMutation';

export interface SavedPriceRecord {
  // Always present. The route lists Supplier-sourced historical_price_record
  // rows directly, so the same material from different suppliers appears as
  // separate catalog records instead of being collapsed into one latest row.
  historicalrec_id: number;
  item_code: number;
  item_name: string;
  supplier_name: string | null;
  brand: string;
  category_type: string | null;
  description_material: string;
  unit: string;
  price: number;
  region: string;
  source: 'Supplier Upload';
  effective_date: string;
  recorded_at: string;
}

// item_name/brand/description/unit live on the shared items row behind a
// record, not on the record itself — see the PATCH route's own comment.
// Editing them here is scoped to Supplier (and, once it exists, Internal)
// catalog data only; DPWH/PSA stay read-only, so there's no equivalent here.
export interface SupplierCatalogEdit {
  item_name?: string;
  brand?: string;
  description?: string;
  unit?: string;
  price?: number;
}

export function usePricelistCatalog() {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, error, refetch } = useFetch<SavedPriceRecord[]>(
    enabled ? '/api/pricelist/catalog' : null
  );
  const deleteMutation = useMutation<{ deleted: boolean }>();
  const updateMutation = useMutation<SavedPriceRecord>();

  const load = useCallback(() => {
    if (!enabled) {
      setEnabled(true);
      return;
    }
    refetch();
  }, [enabled, refetch]);

  // Deletes only the selected Supplier price record. Other supplier records
  // for the same material remain in the catalog.
  const remove = async (historicalrecId: number) => {
    await deleteMutation.mutate(`/api/pricelist/catalog/${historicalrecId}`, undefined, 'DELETE');
    refetch();
  };

  const update = async (historicalrecId: number, patch: SupplierCatalogEdit) => {
    const updated = await updateMutation.mutate(`/api/pricelist/catalog/${historicalrecId}`, patch, 'PATCH');
    refetch();
    return updated;
  };

  return {
    records: data ?? [],
    isLoading,
    error,
    refetch,
    load,
    remove,
    isRemoving: deleteMutation.isLoading,
    removeError: deleteMutation.error,
    update,
    isUpdating: updateMutation.isLoading,
    updateError: updateMutation.error,
  };
}
