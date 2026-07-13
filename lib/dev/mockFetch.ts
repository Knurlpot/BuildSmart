// DEV-ONLY fixture resolver — see lib/dev/mock-toggle.ts.
//
// Matches an endpoint STRING (as passed to useFetch/useMutation, path + optional query
// string) against the fixture that backs it, by pathname — query params and request
// bodies are ignored except where a fixture needs to echo one back (market-insights'
// item_code). This is a visual-review tool, not a filter/persistence simulator: the same
// fixture renders regardless of which filters were picked or what was submitted, and a
// PUT to source-priority doesn't actually persist the reordering.
import { supplierBenchmarksFixture } from "./fixtures/supplierBenchmarks";
import { historicalPriceRecordsFixture } from "./fixtures/historicalPriceRecords";
import { materialPriceVariancesFixture } from "./fixtures/materialPriceVariances";
import { marketInsightFixture } from "./fixtures/marketInsight";
import { companyFixture } from "./fixtures/company";
import { userProfileFixture } from "./fixtures/userProfile";
import { quotationsFixture } from "./fixtures/quotations";
import {
  detectedColumnsFixture,
  extractedItemRowsFixture,
  extractedSupplierRowsFixture,
} from "./fixtures/extractedPriceRows";
import { flaggedPriceDeviationsFixture } from "./fixtures/flaggedPriceDeviations";
import { psaIndexFixture } from "./fixtures/psaIndex";
import { dpwhCatalogFixture } from "./fixtures/dpwhCatalog";
import { dpwhVersionStatusFixture, psaVersionStatusFixture } from "./fixtures/versionStatus";
import { sourcePriorityFixture } from "./fixtures/sourcePriority";
import { savedCatalogFixture } from "./fixtures/savedCatalog";
import { categoriesFixture } from "./fixtures/categories";
import { itemsCatalogFixture } from "./fixtures/itemsCatalog";
import {
  existingRulesFixture,
  laborRulesFixture,
  laborTradeOptionsFixture,
  materialRulesFixture,
  pricingStrategyFixture,
  RULE_ID_IN_USE,
  scopeTemplatesFixture,
  unitRulesFixture,
} from "./provisional/companyRulesFixtures";

function pathnameOf(endpoint: string): string {
  const i = endpoint.indexOf("?");
  return i === -1 ? endpoint : endpoint.slice(0, i);
}

/** Returns the matching fixture, or `undefined` if this endpoint has no mock. */
export function resolveMockFetch(endpoint: string): unknown {
  const pathname = pathnameOf(endpoint);

  if (pathname === "/api/supplier-benchmarks") return supplierBenchmarksFixture;
  if (pathname === "/api/historical-price-records") return historicalPriceRecordsFixture;
  if (pathname === "/api/material-price-variances") return materialPriceVariancesFixture;

  if (pathname === "/api/market-insights") {
    const params = new URLSearchParams(endpoint.slice(endpoint.indexOf("?") + 1));
    const itemCode = params.get("item_code");
    return {
      ...marketInsightFixture,
      item_code: itemCode ? Number(itemCode) : marketInsightFixture.item_code,
    };
  }

  if (pathname === "/api/auth/me") return userProfileFixture;
  if (pathname.startsWith("/api/company/")) return companyFixture;
  if (pathname === "/api/uploads/company-logo") return { url: companyFixture.company_logo };
  if (pathname === "/api/quotations") return quotationsFixture;

  if (pathname === "/api/pricelist/upload") {
    return {
      columns: detectedColumnsFixture,
      item_rows: extractedItemRowsFixture,
      supplier_rows: extractedSupplierRowsFixture,
    };
  }
  if (pathname === "/api/pricelist/commit") return { saved_count: extractedItemRowsFixture.length };
  if (pathname === "/api/pricelist/fetch-published") {
    return { auto_saved_count: 214, flagged: flaggedPriceDeviationsFixture };
  }
  if (pathname === "/api/pricelist/deviations/resolve") return { resolved: true };
  if (pathname === "/api/pricelist/deviations/resolve-bulk") return { resolved_count: 2 };
  if (pathname === "/api/pricelist/fetch-published-index") return { index: psaIndexFixture };
  if (pathname === "/api/pricelist/catalog/dpwh") return dpwhCatalogFixture;
  if (pathname === "/api/pricelist/check-version") {
    const params = new URLSearchParams(endpoint.slice(endpoint.indexOf("?") + 1));
    return params.get("source") === "PSA" ? psaVersionStatusFixture : dpwhVersionStatusFixture;
  }
  if (pathname === "/api/pricelist/source-priority") return sourcePriorityFixture;
  if (pathname === "/api/pricelist/catalog") return savedCatalogFixture;

  if (pathname === "/api/categories") return categoriesFixture;
  if (pathname === "/api/items") return itemsCatalogFixture;

  // --- Company Preferences & Rules (CPRM) — PROVISIONAL, see lib/dev/provisional/. ---
  // Create/update/supersede responses below all return a fixture-shaped stub purely to
  // satisfy the mutate<T>() type contract in mock mode; the forms construct their own
  // optimistic list entries from what the user actually typed rather than reading these
  // back (this mock has no real persistence). check-usage is intentionally the ONE
  // endpoint shared across every rule type (keyed only by rule_id, not by resource) since
  // v5's company_rule envelope makes rule_id a universal spine id — see
  // useCompanyRulesProvisional.ts.
  const RULE_RESOURCES: Record<string, { list: unknown; single: unknown }> = {
    "scope-templates": { list: scopeTemplatesFixture, single: scopeTemplatesFixture[0] },
    "material-rules": { list: materialRulesFixture, single: materialRulesFixture[0] },
    "labor-rules": { list: laborRulesFixture, single: laborRulesFixture[0] },
    "pricing-strategies": { list: pricingStrategyFixture, single: pricingStrategyFixture[0] },
    "unit-rules": { list: unitRulesFixture, single: unitRulesFixture[0] },
  };
  for (const [resource, { list, single }] of Object.entries(RULE_RESOURCES)) {
    const base = `/api/company-rules/${resource}`;
    if (pathname === base) return list;
    if (pathname === `${base}/new`) return single;
    if (pathname.startsWith(`${base}/`)) {
      const rest = pathname.slice(base.length + 1);
      if (rest.endsWith("/supersede")) return single; // POST .../:id/supersede
      if (rest !== "new" && !rest.includes("/")) return single; // PATCH .../:id (edit in place)
    }
  }

  if (pathname === "/api/company-rules/existing") return existingRulesFixture;
  if (pathname === "/api/company-rules/labor-trades") return laborTradeOptionsFixture;
  if (pathname.startsWith("/api/company-rules/existing/") && pathname.endsWith("/check-usage")) {
    const ruleId = pathname.split("/").slice(-2, -1)[0];
    return { in_use: ruleId === RULE_ID_IN_USE };
  }
  if (pathname.startsWith("/api/company-rules/existing/") && pathname.endsWith("/disable")) {
    return { disabled: true };
  }

  return undefined;
}
