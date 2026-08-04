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

  const result = await pool.query<SupplierBenchmarkRow>(
    `SELECT
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
       ) AS overall_score
     FROM suppliers s
     WHERE ${filters.join(" AND ")}
     ORDER BY overall_score DESC, s.supplier_name ASC`,
    values
  );

  return NextResponse.json(result.rows);
}
