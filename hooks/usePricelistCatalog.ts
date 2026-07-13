// Assumed endpoint — UNVERIFIED, confirm with the backend team:
//   GET /api/pricelist/catalog -> SavedPriceRecord[]
//
// Backs the read-only "View Catalog" screen shown after a successful upload commit.
// Plain listing only — no change/variance highlighting here. Whether the backend computes
// material_price_variances for freshly-committed rows, and whether a second upload of the
// same material is even treated as an "update" vs a new record, are both unconfirmed — so
// this view does not attempt to diff or badge anything as changed/new/spiked.
import { useState } from 'react';
import { useFetch } from './useFetch';

export interface SavedPriceRecord {
  historicalrec_id: number;
  item_code: number;
  description: string; // assumed join from items — unconfirmed, see items.ts
  unit: string;
  price: number;
  region: string;
  source: 'Supplier Upload';
  recorded_at: string;
}

export function usePricelistCatalog() {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, error, refetch } = useFetch<SavedPriceRecord[]>(
    enabled ? '/api/pricelist/catalog' : null
  );

  return {
    records: data ?? [],
    isLoading,
    error,
    refetch,
    load: () => setEnabled(true),
  };
}
