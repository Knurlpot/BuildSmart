import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type SupplierCatalogRecord = {
  historicalrec_id: number | null;
  item_code: number;
  item_name: string;
  brand: string;
  description_material: string;
  unit: string;
  price: number;
  region: string;
  source: "Supplier Upload";
  recorded_at: string;
};

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const values: unknown[] = [session.userId];
  const result = await pool.query<SupplierCatalogRecord>(
    `SELECT
       h.historicalrec_id,
       i.item_code,
       i.item_name,
       i.brand,
       COALESCE(NULLIF(i.description, ''), i.material) AS description_material,
       i.unit,
       COALESCE(h.price::float, 0) AS price,
       COALESCE(h.region, 'N/A') AS region,
       'Supplier Upload' AS source,
       COALESCE(h.recorded_at::text, NOW()::text) AS recorded_at
     FROM items i
     LEFT JOIN LATERAL (
       SELECT
         hp.historicalrec_id,
         hp.price,
         hp.region,
         hp.recorded_at
       FROM historical_price_record hp
       WHERE hp.item_code = i.item_code
         AND hp.price_source = 'Supplier'
       ORDER BY hp.recorded_at DESC, hp.historicalrec_id DESC
       LIMIT 1
     ) h ON TRUE
     WHERE i.item_source = 'Supplier'
       AND (i.company_id IS NULL OR i.company_id = (SELECT company_id FROM users WHERE user_id = $1))
     ORDER BY COALESCE(h.recorded_at, NOW()) DESC, i.item_code DESC`,
    values
  );

  return NextResponse.json(result.rows);
}
