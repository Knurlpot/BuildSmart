import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type HistoricalPriceRecordResponse = {
  historicalrec_id: number;
  item_code: number;
  supplier_id: number | null;
  price_source: "DPWH" | "PSA" | "Supplier" | "Internal";
  region: string | null;
  location: string | null;
  effective_date: string;
  quarter: "Q1" | "Q2" | "Q3" | "Q4" | null;
  year: number | null;
  price: number;
  recorded_at: string;
  item_name: string;
  material: string;
  category_type: string | null;
  unit: string;
  actual_quantity: number | null;
  actual_total_cost: number | null;
};

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const region = request.nextUrl.searchParams.get("region");
  const values: unknown[] = [session.userId];
  const filters = [
    `(i.company_id IS NULL OR i.company_id = (SELECT company_id FROM users WHERE user_id = $1))`,
  ];

  if (region && region !== "All") {
    values.push(region);
    filters.push(`h.region = $${values.length}`);
  }

  const result = await pool.query<HistoricalPriceRecordResponse>(
    `WITH quote_usage AS (
       SELECT
         qi.item_code,
         SUM(qi.quantity)::float AS actual_quantity,
         SUM(qi.total_cost)::float AS actual_total_cost
       FROM quotation_items qi
       JOIN quotation q ON q.quote_id = qi.quote_id
       WHERE q.user_id = $1
       GROUP BY qi.item_code
     )
     SELECT
       h.historicalrec_id,
       h.item_code,
       h.supplier_id,
       h.price_source,
       h.region,
       h.location,
       h.effective_date::text AS effective_date,
       h.quarter,
       h.year,
       h.price::float AS price,
       h.recorded_at::text AS recorded_at,
       i.item_name,
       COALESCE(NULLIF(i.description, ''), i.item_name) AS material,
       c.category_type,
       i.unit,
       qu.actual_quantity,
       qu.actual_total_cost
     FROM historical_price_record h
     JOIN items i ON i.item_code = h.item_code
     LEFT JOIN category c ON c.category_id = i.category_id
     LEFT JOIN quote_usage qu ON qu.item_code = h.item_code
     WHERE ${filters.join(" AND ")}
     ORDER BY h.effective_date DESC, h.recorded_at DESC, h.historicalrec_id DESC`,
    values
  );

  return NextResponse.json(result.rows);
}
