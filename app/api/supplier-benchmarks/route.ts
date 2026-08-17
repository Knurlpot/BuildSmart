import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type SupplierBenchmarkRow = {
  benchmark_id: number;
  supplier_id: number;
  supplier_name: string;
  region: string;
  average_price_score: number;
  update_frequency_score: number;
  reliability_score: number;
  delivery_score: number;
  overall_score: number;
  price_stability_score: number;
  item_count: number;
  trend_direction: string;
  best_for_value_score: number;
};

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const region = request.nextUrl.searchParams.get("region");
  const category = request.nextUrl.searchParams.get("category");
  const values: unknown[] = [session.userId];
  const filters = ["s.status = 'Active'"];

  if (region && region !== "All") {
    values.push(region);
    filters.push(`s.region = $${values.length}`);
  }

  if (category && category !== "All") {
    values.push(category);
    filters.push(
      `EXISTS (
         SELECT 1
         FROM historical_price_record h
         JOIN items i ON i.item_code = h.item_code
         LEFT JOIN category c ON c.category_id = i.category_id
         WHERE h.supplier_id = s.supplier_id
           AND h.price_source = 'Supplier'
           AND c.category_type = $${values.length}
           AND (i.company_id IS NULL OR i.company_id = (SELECT company_id FROM users WHERE user_id = $1))
       )`
    );
  }

  try {
    const result = await pool.query<SupplierBenchmarkRow>(
      `WITH supplier_items AS (
       SELECT 
         s.supplier_id,
         COUNT(DISTINCT h.item_code) AS item_count
       FROM suppliers s
       LEFT JOIN historical_price_record h ON h.supplier_id = s.supplier_id
         AND h.price_source = 'Supplier'
       LEFT JOIN items i ON i.item_code = h.item_code
       WHERE s.status = 'Active'
         AND (i.item_code IS NULL OR i.company_id IS NULL OR i.company_id = (SELECT company_id FROM users WHERE user_id = $1))
       GROUP BY s.supplier_id
     ),
     supplier_price_history AS (
       SELECT
         h.supplier_id,
         h.item_code,
         h.effective_date,
         h.price::float AS price,
         LAG(h.price::float) OVER (
           PARTITION BY h.supplier_id, h.item_code
           ORDER BY h.effective_date, h.historicalrec_id
         ) AS previous_price
       FROM historical_price_record h
       JOIN items i ON i.item_code = h.item_code
       WHERE h.price_source = 'Supplier'
         AND h.supplier_id IS NOT NULL
         AND (i.company_id IS NULL OR i.company_id = (SELECT company_id FROM users WHERE user_id = $1))
     ),
     supplier_price_changes AS (
       SELECT
         supplier_id,
         effective_date,
         ((price - previous_price) / NULLIF(previous_price, 0)) * 100 AS percent_change
       FROM supplier_price_history
       WHERE previous_price IS NOT NULL
     ),
     supplier_latest_change_period AS (
       SELECT supplier_id, MAX(effective_date) AS latest_effective_date
       FROM supplier_price_changes
       GROUP BY supplier_id
     ),
     supplier_latest_change AS (
       SELECT
         c.supplier_id,
         AVG(c.percent_change) AS latest_percent_change
       FROM supplier_price_changes c
       JOIN supplier_latest_change_period p
         ON p.supplier_id = c.supplier_id
        AND p.latest_effective_date = c.effective_date
       GROUP BY c.supplier_id
     ),
     supplier_stability AS (
       SELECT
         c.supplier_id,
         GREATEST(0, 100 - (AVG(ABS(COALESCE(c.percent_change, 0))) * 2)) AS price_stability_score
       FROM supplier_price_changes c
       GROUP BY c.supplier_id
     )
     SELECT
       s.supplier_id AS benchmark_id,
       s.supplier_id,
       s.supplier_name,
       s.region,
       COALESCE(s.average_price_score::float, 0) AS average_price_score,
       COALESCE(s.update_frequency_score::float, 0) AS update_frequency_score,
       COALESCE(s.reliability_score::float, 0) AS reliability_score,
       COALESCE(s.delivery_score::float, 0) AS delivery_score,
       COALESCE(
         s.overall_score::float,
         (
           COALESCE(s.average_price_score::float, 0) +
           COALESCE(s.update_frequency_score::float, 0) +
           COALESCE(s.reliability_score::float, 0) +
           COALESCE(s.delivery_score::float, 0)
         ) / 4.0
       ) AS overall_score,
       COALESCE(ss.price_stability_score::float, 100) AS price_stability_score,
       COALESCE(si.item_count, 0) AS item_count,
       CASE
         WHEN slc.latest_percent_change > 2 THEN 'Up'
         WHEN slc.latest_percent_change < -2 THEN 'Down'
         ELSE 'Stable'
       END AS trend_direction,
       (
         COALESCE(s.average_price_score::float, 50) * 0.4 +
         COALESCE(ss.price_stability_score::float, 100) * 0.6
       ) / 100 * LEAST(COALESCE(si.item_count::float, 1) / 50 * 100, 100) AS best_for_value_score
     FROM suppliers s
     LEFT JOIN supplier_items si ON si.supplier_id = s.supplier_id
     LEFT JOIN supplier_stability ss ON ss.supplier_id = s.supplier_id
     LEFT JOIN supplier_latest_change slc ON slc.supplier_id = s.supplier_id
     WHERE ${filters.join(" AND ")}
     ORDER BY best_for_value_score DESC, overall_score DESC, s.supplier_name ASC`,
      values
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load supplier benchmarks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
