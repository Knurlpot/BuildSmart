// PROVISIONAL — Part C (Task 6) "Refresh Prices." There is no real price-change source yet:
// backend is integrating one into Pricelist Management (suppliers raising prices over time —
// "+5% on all," "increase on X, Y, Z" per the task spec), and this file is the mock stand-in
// for it. FLAG FOR BACKEND: the day Pricelist Management exposes real updated base prices
// (or a real price-history feed), `repriceItemLines` below is deleted and
// savedProjectsStore.ts's refreshQuotePrices() is repointed at that real source — the STORE
// FUNCTION and the versioning it drives (new version, original preserved) stay exactly as
// built; only where the new numbers come from changes.
//
// The multiplier below is NOT a real market signal. It exists only so "Refresh Prices" has
// something honest-but-fake to demonstrate the MECHANISM against: a saved quote's numbers
// visibly change in a new version while the original stays byte-for-byte the same.
import { currentRateForItemCode } from './quotationBreakdownFixtures';
import type { PricelistBasis, ProvisionalItemLine, ProvisionalTier } from './quotationBreakdownTypes';

export const MOCK_SUPPLIER_PRICE_DRIFT_PERCENTAGE = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Re-prices a set of item lines at "today's" mock current rate. A manually overridden line
 * (Minor Revision changed its qty/price/supplier before Finalize) is a deliberate human
 * decision and stays untouched — same "override always wins" contract
 * retargetItemLinesBasis() uses. A line whose item_code no longer exists in the fixture table
 * is left as-is rather than dropped or fabricated. */
export function repriceItemLines(items: ProvisionalItemLine[], tier: ProvisionalTier, basis: PricelistBasis, asOfIso: string): ProvisionalItemLine[] {
  return items.map((line) => {
    if (line.is_overridden) return line;
    const baseRate = currentRateForItemCode(line.item_code, tier, basis);
    if (baseRate === null) return line;
    const driftedRate = round2(baseRate * (1 + MOCK_SUPPLIER_PRICE_DRIFT_PERCENTAGE / 100));
    return {
      ...line,
      unit_price: driftedRate,
      total_cost: round2(line.quantity * driftedRate),
      pricing_reference: {
        ...line.pricing_reference,
        recorded_at: basis === 'Uploaded' ? asOfIso : line.pricing_reference.recorded_at,
      },
    };
  });
}
