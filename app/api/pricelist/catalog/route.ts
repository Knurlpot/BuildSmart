import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type SupplierCatalogRecord = {
  historicalrec_id: number;
  item_code: number;
  item_name: string;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_location: string | null;
  brand: string;
  category_type: string | null;
  description_material: string;
  unit: string;
  price: number;
  region: string;
  source: "Supplier Upload";
  effective_date: string;
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
       h.supplier_id,
       s.supplier_name,
       COALESCE(
         NULLIF(BTRIM(h.location), ''),
         NULLIF(CONCAT_WS(', ', NULLIF(BTRIM(s.city), ''), NULLIF(BTRIM(s.region), '')), '')
       ) AS supplier_location,
       i.brand,
       c.category_type,
       CASE
         WHEN BTRIM(COALESCE(i.description, '')) = BTRIM(i.item_name) THEN ''
         ELSE COALESCE(i.description, '')
       END AS description_material,
       i.unit,
       COALESCE(h.price::float, 0) AS price,
       COALESCE(h.region, 'N/A') AS region,
       'Supplier Upload' AS source,
       h.effective_date::text AS effective_date,
       COALESCE(h.recorded_at::text, NOW()::text) AS recorded_at
     FROM historical_price_record h
     JOIN items i ON i.item_code = h.item_code
     LEFT JOIN category c ON c.category_id = i.category_id
     LEFT JOIN suppliers s ON s.supplier_id = h.supplier_id
     WHERE h.price_source = 'Supplier'
       AND i.item_source = 'Supplier'
       AND (i.company_id IS NULL OR i.company_id = (SELECT company_id FROM users WHERE user_id = $1))
     ORDER BY h.effective_date DESC, h.recorded_at DESC, h.historicalrec_id DESC`,
    values
  );

  return NextResponse.json(result.rows);
}
