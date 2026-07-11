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

  return undefined;
}
