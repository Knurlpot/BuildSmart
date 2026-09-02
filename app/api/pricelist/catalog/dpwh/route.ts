import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type DpwhCatalogRecord = {
  historicalrec_id: number;
  item_code: number;
  item_name: string | null;
  category_type: string | null;
  region: string;
  location: string | null;
  effective_date: string;
  quarter: string;
  year: number;
  price: number;
};

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query<DpwhCatalogRecord>(
    `SELECT
       h.historicalrec_id,
       h.item_code,
       i.item_name,
       c.category_type,
       COALESCE(h.region, 'N/A') AS region,
       h.location,
       h.effective_date::text AS effective_date,
       COALESCE(h.quarter, '') AS quarter,
       COALESCE(h.year, 0) AS year,
       COALESCE(h.price::float, 0) AS price
     FROM historical_price_record h
     LEFT JOIN items i ON i.item_code = h.item_code
     LEFT JOIN category c ON c.category_id = i.category_id
     WHERE h.price_source = 'DPWH'
     ORDER BY h.effective_date DESC, h.recorded_at DESC, h.historicalrec_id DESC`
  );

  return NextResponse.json(result.rows);
}
