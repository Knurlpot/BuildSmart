import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type MaterialPriceVarianceResponse = {
  mpv_id: number;
  item_code: number | null;
  variance_source: "Internal" | "PSA";
  commodity_group: string | null;
  effective_date: string;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  year: number;
  percent_change: number;
  trend_direction: "Up" | "Down" | "Stable";
  is_significant_spike: boolean;
  item_name: string | null;
  material: string | null;
  category_type: string | null;
};

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query<MaterialPriceVarianceResponse>(
    `SELECT
       v.mpv_id,
       v.item_code,
       v.variance_source,
       v.commodity_group,
       v.effective_date::text AS effective_date,
       v.quarter,
       v.year,
       v.percent_change::float AS percent_change,
       v.trend_direction,
       v.is_significant_spike,
       i.item_name,
       COALESCE(NULLIF(i.description, ''), i.item_name) AS material,
       c.category_type
     FROM material_price_variance v
     LEFT JOIN items i ON i.item_code = v.item_code
     LEFT JOIN category c ON c.category_id = i.category_id
     WHERE v.variance_source = 'PSA'
        OR i.company_id IS NULL
        OR i.company_id = (SELECT company_id FROM users WHERE user_id = $1)
     ORDER BY v.effective_date DESC, COALESCE(v.commodity_group, i.item_name)`,
    [session.userId]
  );

  return NextResponse.json(result.rows);
}
