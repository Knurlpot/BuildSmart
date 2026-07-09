// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Matches MarketInsight exactly
// (hooks/useMarketIntelligence.ts). `item_code` is overwritten by the resolver to echo
// whatever the page actually requested, so the panel never shows a mismatched id.
import type { MarketInsight } from "@/hooks/useMarketIntelligence";

export const marketInsightFixture: MarketInsight = {
  item_code: 201,
  insight:
    "Prices for this material rose gradually over the past year, with the increase " +
    "accelerating slightly in the most recent quarter. This reads as steady demand " +
    "growth rather than a supply shock — worth revisiting your quotation markups if " +
    "the trend continues into next quarter.",
};
