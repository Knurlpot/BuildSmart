import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type InsightRow = {
  item_code: number;
  item_name: string;
  material: string;
  latest_actual: number | null;
  latest_dpwh: number | null;
  latest_psa_change: number | null;
};

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const itemCode = Number(request.nextUrl.searchParams.get("item_code"));
  if (Number.isNaN(itemCode)) {
    return NextResponse.json({ error: "Invalid item_code" }, { status: 400 });
  }

  const result = await pool.query<InsightRow>(
    `WITH latest_actual AS (
       SELECT item_code, price::float AS price
       FROM historical_price_record
       WHERE item_code = $2 AND price_source IN ('Supplier', 'Internal')
       ORDER BY recorded_at DESC, historicalrec_id DESC
       LIMIT 1
     ),
     latest_dpwh AS (
       SELECT item_code, price::float AS price
       FROM historical_price_record
       WHERE item_code = $2 AND price_source = 'DPWH'
       ORDER BY year DESC NULLS LAST, quarter DESC NULLS LAST, recorded_at DESC
       LIMIT 1
     ),
     latest_psa AS (
       SELECT percent_change::float AS percent_change
       FROM material_price_variance v
       JOIN items i ON LOWER(COALESCE(NULLIF(i.description, ''), i.item_name)) = LOWER(v.commodity_group)
       WHERE i.item_code = $2 AND v.variance_source = 'PSA'
       ORDER BY v.year DESC, v.quarter DESC
       LIMIT 1
     )
     SELECT
       i.item_code,
       i.item_name,
       COALESCE(NULLIF(i.description, ''), i.item_name) AS material,
       la.price AS latest_actual,
       ld.price AS latest_dpwh,
       lp.percent_change AS latest_psa_change
     FROM items i
     LEFT JOIN latest_actual la ON la.item_code = i.item_code
     LEFT JOIN latest_dpwh ld ON ld.item_code = i.item_code
     LEFT JOIN latest_psa lp ON true
     WHERE i.item_code = $2
       AND (i.company_id IS NULL OR i.company_id = (SELECT company_id FROM users WHERE user_id = $1))
     LIMIT 1`,
    [session.userId, itemCode]
  );

  const row = result.rows[0];
  if (!row) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const parts = [`${row.item_name} should be reviewed against the latest DPWH regional baseline before quotation use.`];
  if (row.latest_actual != null && row.latest_dpwh != null) {
    const deviation = ((row.latest_actual - row.latest_dpwh) / row.latest_dpwh) * 100;
    parts.push(
      `Current observed pricing is ${Math.abs(deviation).toFixed(1)}% ${deviation >= 0 ? "above" : "below"} the DPWH benchmark.`
    );
  }
  if (row.latest_psa_change != null) {
    parts.push(`The closest PSA commodity index moved ${row.latest_psa_change.toFixed(1)}%, which helps separate market inflation from supplier markup.`);
  }

  return NextResponse.json({ item_code: row.item_code, insight: parts.join(" ") });
}
