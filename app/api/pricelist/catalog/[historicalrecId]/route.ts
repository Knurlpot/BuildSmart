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
  effective_date: string;
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
      itemValues.push(body.description.trim() || null);
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

// Deletes EVERY Supplier-owned database record for the material behind the row
// shown: all Supplier price history, cached match approvals, pending/review
// rows for now-orphaned uploads, and the Supplier item itself when nothing else
// references it. Upload logs are removed once no Supplier prices remain for the
// same company/supplier/effective-date, so uploading the same deleted file goes
// through the normal new-file flow again.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ historicalrecId: string }> }) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { historicalrecId } = await params;
  const recordId = Number(historicalrecId);
  if (!Number.isInteger(recordId)) {
    return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lookup = await client.query<{ item_code: number; company_id: number; item_company_id: number | null }>(
      `SELECT i.item_code,
              u.company_id,
              i.company_id AS item_company_id
       FROM historical_price_record hp
       JOIN items i ON i.item_code = hp.item_code
       JOIN users u ON u.user_id = $2
       WHERE hp.historicalrec_id = $1
         AND hp.price_source = 'Supplier'
         AND (i.company_id IS NULL OR i.company_id = u.company_id)`,
      [recordId, session.userId]
    );

    const target = lookup.rows[0];
    if (!target) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Price record not found" }, { status: 404 });
    }

    const deletedPrices = await client.query<{ historicalrec_id: number; supplier_id: number | null; effective_date: string }>(
      `DELETE FROM historical_price_record hp
       USING items i
       WHERE hp.item_code = i.item_code
         AND hp.item_code = $1
         AND hp.price_source = 'Supplier'
         AND (i.company_id IS NULL OR i.company_id = $2)
       RETURNING hp.historicalrec_id, hp.supplier_id, hp.effective_date::text AS effective_date`,
      [target.item_code, target.company_id]
    );

    await client.query(`DELETE FROM approved_match_cache WHERE item_code = $1 AND (company_id IS NULL OR company_id = $2)`, [
      target.item_code,
      target.company_id,
    ]);

    const deletedUploadIds = new Set<number>();
    for (const row of deletedPrices.rows) {
      const uploadLookup = await client.query<{ upload_id: number }>(
        `SELECT plu.upload_id
         FROM price_list_upload plu
         WHERE plu.company_id = $1
           AND COALESCE(plu.source, 'Supplier') = 'Supplier'
           AND plu.effective_date = $2::date
           AND (
             (plu.supplier_id IS NULL AND $3::int IS NULL)
             OR plu.supplier_id = $3::int
           )
           AND NOT EXISTS (
             SELECT 1
             FROM historical_price_record hp
             JOIN items i ON i.item_code = hp.item_code
             WHERE hp.price_source = 'Supplier'
               AND hp.effective_date = plu.effective_date
               AND (
                 (hp.supplier_id IS NULL AND plu.supplier_id IS NULL)
                 OR hp.supplier_id = plu.supplier_id
               )
               AND (i.company_id IS NULL OR i.company_id = plu.company_id)
           )`,
        [target.company_id, row.effective_date, row.supplier_id]
      );

      for (const upload of uploadLookup.rows) {
        deletedUploadIds.add(upload.upload_id);
      }
    }

    if (deletedUploadIds.size > 0) {
      const uploadIds = [...deletedUploadIds];
      await client.query(`DELETE FROM pricelist_review_item WHERE upload_id = ANY($1::int[])`, [uploadIds]);
      await client.query(`DELETE FROM price_list_upload WHERE upload_id = ANY($1::int[])`, [uploadIds]);
    }

    const itemDelete = await client.query(
      `DELETE FROM items i
       WHERE i.item_code = $1
         AND i.item_source = 'Supplier'
         AND (i.company_id IS NULL OR i.company_id = $2)
         AND NOT EXISTS (
           SELECT 1 FROM historical_price_record hp WHERE hp.item_code = i.item_code
         )
         AND NOT EXISTS (
           SELECT 1 FROM quotation_items qi WHERE qi.item_code = i.item_code
         )
       RETURNING i.item_code`,
      [target.item_code, target.company_id]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      deleted: true,
      deletedCount: deletedPrices.rowCount,
      deletedUploadCount: deletedUploadIds.size,
      deletedItem: (itemDelete.rowCount ?? 0) > 0,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    client.release();
  }
}
