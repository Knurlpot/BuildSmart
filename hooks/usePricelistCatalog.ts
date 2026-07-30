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
  // Null when the item has no Supplier-sourced historical_price_record yet —
  // the route's LEFT JOIN LATERAL still returns the Items row itself in that
  // case (see app/api/pricelist/catalog/route.ts). Nothing to delete for such
  // a row until a price is actually recorded against it.
  historicalrec_id: number | null;
  item_code: number;
  item_name: string;
  brand: string;
  description_material: string;
  unit: string;
  price: number;
  region: string;
  source: 'Supplier Upload';
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

  // Deletes just this one price record (see the route's own scoping) — the
  // underlying item and any other price history for it are untouched.
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
