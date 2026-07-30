import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

type SupplierCatalogRecord = {
  historicalrec_id: number;
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

type PatchBody = Partial<{
  item_name: string;
  brand: string;
  description: string;
  unit: string;
  price: number;
}>;

// item_name/brand/description/unit live on the shared `items` row, not on
// this one historical_price_record — editing them here intentionally ripples
// to every other price record for the same item (any source). That's a
// deliberate scope decision for Supplier/Internal catalog data (which this
// app owns), never extended to DPWH/PSA (externally published, read-only).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ historicalrecId: string }> }) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { historicalrecId } = await params;
  const recordId = Number(historicalrecId);
  if (!Number.isInteger(recordId)) {
    return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as PatchBody;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lookup = await client.query<{ item_code: number }>(
      `SELECT i.item_code
       FROM historical_price_record hp
       JOIN items i ON i.item_code = hp.item_code
       WHERE hp.historicalrec_id = $1
         AND hp.price_source = 'Supplier'
         AND (i.company_id IS NULL OR i.company_id = (SELECT company_id FROM users WHERE user_id = $2))`,
      [recordId, session.userId]
    );

    const itemCode = lookup.rows[0]?.item_code;
    if (!itemCode) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Price record not found" }, { status: 404 });
    }

    const itemAssignments: string[] = [];
    const itemValues: unknown[] = [];
    let paramIndex = 1;
    if (body.item_name !== undefined) {
      itemAssignments.push(`item_name = $${paramIndex++}`);
      itemValues.push(body.item_name);
    }
    if (body.brand !== undefined) {
      itemAssignments.push(`brand = $${paramIndex++}`);
      itemValues.push(body.brand);
    }
    if (body.description !== undefined) {
      itemAssignments.push(`description = $${paramIndex++}`);
      itemValues.push(body.description);
    }
    if (body.unit !== undefined) {
      itemAssignments.push(`unit = $${paramIndex++}`);
      itemValues.push(body.unit);
    }

    if (itemAssignments.length > 0) {
      itemValues.push(itemCode);
      await client.query(`UPDATE items SET ${itemAssignments.join(", ")} WHERE item_code = $${paramIndex}`, itemValues);
    }

    if (body.price !== undefined) {
      await client.query(
        `UPDATE historical_price_record SET price = $1 WHERE historicalrec_id = $2 AND price_source = 'Supplier'`,
        [body.price, recordId]
      );
    }

    await client.query("COMMIT");

    const updated = await client.query<SupplierCatalogRecord>(
      `SELECT
         h.historicalrec_id,
         i.item_code,
         i.item_name,
         i.brand,
         COALESCE(NULLIF(i.description, ''), i.item_name) AS description_material,
         i.unit,
         COALESCE(h.price::float, 0) AS price,
         COALESCE(h.region, 'N/A') AS region,
         'Supplier Upload' AS source,
         COALESCE(h.recorded_at::text, NOW()::text) AS recorded_at
       FROM items i
       JOIN historical_price_record h ON h.item_code = i.item_code
       WHERE h.historicalrec_id = $1`,
      [recordId]
    );

    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    client.release();
  }
}

// Deletes EVERY Supplier price record for the item behind the row shown, not
// just the one historicalrec_id — the catalog only ever displays an item's
// latest record (see the JOIN LATERAL in ../route.ts), so removing just that
// one left older history underneath, silently re-surfacing the row with an
// older price instead of making it disappear. Still scoped to Supplier +
// the caller's own company, so a guessed id can't touch another company's or
// another source's data — just widened from "this one row" to "this item's
// whole Supplier history".
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ historicalrecId: string }> }) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { historicalrecId } = await params;
  const recordId = Number(historicalrecId);
  if (!Number.isInteger(recordId)) {
    return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
  }

  const lookup = await pool.query<{ item_code: number }>(
    `SELECT i.item_code
     FROM historical_price_record hp
     JOIN items i ON i.item_code = hp.item_code
     WHERE hp.historicalrec_id = $1
       AND hp.price_source = 'Supplier'
       AND (i.company_id IS NULL OR i.company_id = (SELECT company_id FROM users WHERE user_id = $2))`,
    [recordId, session.userId]
  );

  const itemCode = lookup.rows[0]?.item_code;
  if (!itemCode) {
    return NextResponse.json({ error: "Price record not found" }, { status: 404 });
  }

  const result = await pool.query(
    `DELETE FROM historical_price_record WHERE item_code = $1 AND price_source = 'Supplier' RETURNING historicalrec_id`,
    [itemCode]
  );

  return NextResponse.json({ deleted: true, deletedCount: result.rowCount });
}
