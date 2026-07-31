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
  // Always present — the route's JOIN LATERAL requires an actual
  // Supplier-sourced historical_price_record to exist for an item to appear
  // here at all (see app/api/pricelist/catalog/route.ts). An item that's had
  // its only price record deleted drops out of this list entirely, rather
  // than lingering as a zero-price row with nothing left to act on.
  historicalrec_id: number;
  item_code: number;
  item_name: string;
  brand: string;
  category_type: string | null;
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

  // Deletes EVERY Supplier price record for the item behind this row (see
  // the route's own comment for why) — the underlying Items row itself is
  // untouched, but its whole Supplier price history is gone, not just the
  // single latest record shown.
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
