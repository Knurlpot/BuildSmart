import "server-only";

import type { MaterialPriceVariance } from "@/types/entities";

export const PSA_CMRPI_API_URL =
  "https://openstat.psa.gov.ph:443/PXWeb/api/v1/en/DB/2M/PI/RPI/0062M4ACMR1.px";

const PERIOD_TO_MONTH: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

const MONTH_TO_QUARTER = ["Q1", "Q1", "Q1", "Q2", "Q2", "Q2", "Q3", "Q3", "Q3", "Q4", "Q4", "Q4"] as const;

type PxWebMetadata = {
  variables: Array<{
    code: string;
    values: string[];
    valueTexts: string[];
  }>;
};

type CmrpiIndexRow = {
  commodityGroup: string;
  year: number;
  period: string;
  month: number;
  indexValue: number;
};

function cleanCommodityGroup(value: string) {
  return value.replace(/^\.+/, "").replace(/\s+/g, " ").trim();
}

function csvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (quoted && char === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }

  return rows;
}

function parsePsaCsv(csv: string): CmrpiIndexRow[] {
  const rows = csvRows(csv);
  const headers = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const result: CmrpiIndexRow[] = [];

  for (const row of dataRows) {
    const commodityGroup = cleanCommodityGroup(row[1] ?? "");
    if (!commodityGroup) continue;

    headers.slice(2).forEach((header, offset) => {
      const match = /^(\d{4})\s+([A-Za-z]{3})$/.exec(header);
      const month = match ? PERIOD_TO_MONTH[match[2]] : undefined;
      if (!match || !month) return;

      const rawValue = row[offset + 2];
      if (!rawValue || rawValue === "..") return;
      const indexValue = Number(rawValue);
      if (!Number.isFinite(indexValue)) return;

      result.push({
        commodityGroup,
        year: Number(match[1]),
        period: match[2],
        month,
        indexValue,
      });
    });
  }

  return result;
}

function latestCompletePeriod(rows: CmrpiIndexRow[]) {
  return rows.reduce<CmrpiIndexRow | null>((latest, row) => {
    if (!latest) return row;
    if (row.year > latest.year) return row;
    if (row.year === latest.year && row.month > latest.month) return row;
    return latest;
  }, null);
}

function trendDirection(percentChange: number): MaterialPriceVariance["trend_direction"] {
  if (percentChange > 0.05) return "Up";
  if (percentChange < -0.05) return "Down";
  return "Stable";
}

export async function fetchLatestPsaCmrpiVariances(): Promise<MaterialPriceVariance[]> {
  const metadataResponse = await fetch(PSA_CMRPI_API_URL, {
    headers: { accept: "application/json" },
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!metadataResponse.ok) throw new Error(`PSA CMRPI metadata request failed: ${metadataResponse.status}`);

  const metadata = (await metadataResponse.json()) as PxWebMetadata;
  const yearVariable = metadata.variables.find((variable) => variable.code === "Year");
  const latestYearCode = yearVariable?.values.at(-1);
  const previousYearCode = yearVariable?.values.at(-2);
  if (!latestYearCode || !previousYearCode) throw new Error("PSA CMRPI metadata did not include enough years");

  const query = {
    query: [
      { code: "Geographic location", selection: { filter: "item", values: ["0"] } },
      { code: "Commodity Description", selection: { filter: "all", values: ["*"] } },
      { code: "Year", selection: { filter: "item", values: [previousYearCode, latestYearCode] } },
      { code: "Period", selection: { filter: "all", values: ["*"] } },
    ],
    response: { format: "csv" },
  };

  const dataResponse = await fetch(PSA_CMRPI_API_URL, {
    method: "POST",
    headers: {
      accept: "text/csv, text/plain",
      "content-type": "application/json",
    },
    body: JSON.stringify(query),
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!dataResponse.ok) throw new Error(`PSA CMRPI data request failed: ${dataResponse.status}`);

  const rows = parsePsaCsv(await dataResponse.text());
  const latest = latestCompletePeriod(rows);
  if (!latest) return [];

  const latestRows = rows.filter((row) => row.year === latest.year && row.month === latest.month);
  const priorRows = new Map(
    rows
      .filter((row) => row.year === latest.year - 1 && row.month === latest.month)
      .map((row) => [row.commodityGroup.toLowerCase(), row])
  );

  return latestRows.flatMap((row, index) => {
    const prior = priorRows.get(row.commodityGroup.toLowerCase());
    if (!prior || prior.indexValue <= 0) return [];

    const percentChange = ((row.indexValue - prior.indexValue) / prior.indexValue) * 100;
    const effectiveDate = `${row.year}-${String(row.month).padStart(2, "0")}-01`;

    return {
      mpv_id: -1 - index,
      item_code: null,
      variance_source: "PSA",
      commodity_group: row.commodityGroup,
      effective_date: effectiveDate,
      quarter: MONTH_TO_QUARTER[row.month - 1],
      year: row.year,
      percent_change: Number(percentChange.toFixed(2)),
      trend_direction: trendDirection(percentChange),
      is_significant_spike: Math.abs(percentChange) >= 15,
    } satisfies MaterialPriceVariance;
  });
}
