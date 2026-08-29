import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type HistoricalPriceRecordResponse = {
  historicalrec_id: number;
  item_code: number;
  supplier_id: number | null;
  supplier_name: string | null;
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
       s.supplier_name,
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
     LEFT JOIN suppliers s ON s.supplier_id = h.supplier_id
     LEFT JOIN category c ON c.category_id = i.category_id
     LEFT JOIN quote_usage qu ON qu.item_code = h.item_code
     WHERE ${filters.join(" AND ")}
     ORDER BY h.effective_date DESC, h.recorded_at DESC, h.historicalrec_id DESC`,
    values
  );

  return NextResponse.json(result.rows);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid price payload" }, { status: 400 });
  }

  const rawItemCode = (body as { item_code?: unknown }).item_code;
  const itemCode = rawItemCode === null || rawItemCode === undefined || rawItemCode === "" ? null : Number(rawItemCode);
  const itemName = clean((body as { item_name?: unknown }).item_name);
  const unit = clean((body as { unit?: unknown }).unit) || "unit";
  const supplierId = Number((body as { supplier_id?: unknown }).supplier_id);
  const price = Number((body as { price?: unknown }).price);
  const location = clean((body as { location?: unknown }).location) || null;

  if (itemCode !== null && !Number.isInteger(itemCode)) {
    return NextResponse.json({ error: "Select a valid catalog material before saving a supplier price." }, { status: 400 });
  }
  if (itemCode === null && !itemName) {
    return NextResponse.json({ error: "Material name is required when creating a supplier price." }, { status: 400 });
  }
  if (!Number.isInteger(supplierId)) {
    return NextResponse.json({ error: "Select a valid supplier." }, { status: 400 });
  }
  if (!(price > 0)) {
    return NextResponse.json({ error: "Price must be greater than zero." }, { status: 400 });
  }

  const result = await pool.query<HistoricalPriceRecordResponse>(
    `WITH user_company AS (
       SELECT company_id FROM users WHERE user_id = $4
     ),
     fallback_category AS (
       SELECT category_id
       FROM category
       WHERE category_type = 'Others'
       ORDER BY category_id
       LIMIT 1
     ),
     existing_item AS (
       SELECT item_code
       FROM items
       WHERE $1::int IS NOT NULL
         AND item_code = $1
         AND (company_id IS NULL OR company_id = (SELECT company_id FROM user_company))
       LIMIT 1
     ),
     created_item AS (
       INSERT INTO items (
         category_id, company_id, item_name, brand, unit, item_source, description
       )
       SELECT fallback_category.category_id, user_company.company_id, $6, 'Unspecified', $7, 'Supplier', $6
       FROM fallback_category, user_company
       WHERE $1::int IS NULL
       RETURNING item_code
     ),
     item_match AS (
       SELECT item_code FROM existing_item
       UNION ALL
       SELECT item_code FROM created_item
       LIMIT 1
     ),
     supplier_match AS (
       SELECT supplier_id, region
       FROM suppliers
       WHERE supplier_id = $2 AND status = 'Active'
       LIMIT 1
     ),
     saved AS (
       INSERT INTO historical_price_record (
         item_code, supplier_id, price_source, region, location, effective_date, price
       )
       SELECT item_match.item_code, supplier_match.supplier_id, 'Supplier', supplier_match.region, $5, CURRENT_DATE, $3
       FROM item_match, supplier_match
       ON CONFLICT (item_code, supplier_id, price_source, region, location, effective_date)
       DO UPDATE SET price = EXCLUDED.price, recorded_at = CURRENT_TIMESTAMP
       RETURNING historicalrec_id, item_code, supplier_id, price_source, region, location,
                 effective_date::text AS effective_date, quarter, year, price::float AS price,
                 recorded_at::text AS recorded_at
     )
     SELECT
       saved.historicalrec_id,
       saved.item_code,
       saved.supplier_id,
       saved.price_source,
       saved.region,
       saved.location,
       saved.effective_date,
       saved.quarter,
       saved.year,
       saved.price,
       saved.recorded_at,
       i.item_name,
       COALESCE(NULLIF(i.description, ''), i.item_name) AS material,
       c.category_type,
       i.unit,
       NULL::float AS actual_quantity,
       NULL::float AS actual_total_cost
     FROM saved
     JOIN items i ON i.item_code = saved.item_code
     LEFT JOIN category c ON c.category_id = i.category_id`,
    [itemCode, supplierId, price, session.userId, location, itemName, unit]
  );

  const saved = result.rows[0];
  if (!saved) {
    return NextResponse.json({ error: "Material or supplier was not found." }, { status: 404 });
  }

  return NextResponse.json(saved, { status: 201 });
}
