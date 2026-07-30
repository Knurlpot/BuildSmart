import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type ItemRecord = {
  item_code: number;
  category_id: number;
  company_id: number | null;
  item_name: string;
  brand: string;
  unit: string;
  color: string | null;
  item_source: "DPWH" | "PSA" | "Supplier" | "Internal";
  description: string | null;
};

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query<ItemRecord>(
    `SELECT
       i.item_code,
       i.category_id,
       i.company_id,
       i.item_name,
       i.brand,
       i.unit,
       i.color,
       i.item_source,
       i.description
     FROM items i
     WHERE i.company_id IS NULL
        OR i.company_id = (SELECT company_id FROM users WHERE user_id = $1)
     ORDER BY i.item_name ASC, i.item_code ASC`,
    [session.userId]
  );

  return NextResponse.json(result.rows);
}
