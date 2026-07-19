import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { item_rows = [], supplier_rows = [], requires_confirmation, confirmed } = body || {};

    if (!confirmed && requires_confirmation) {
      return NextResponse.json({ error: "Confirmation required before saving" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let supplierId: number | null = null;
      if (supplier_rows?.length) {
        const firstSupplier = supplier_rows[0];
        const supplierName = (firstSupplier?.supplier_name || "Imported Supplier").toString().slice(0, 100);
        const supplierAddress = (firstSupplier?.supplier_address || "N/A").toString().slice(0, 255);
        const city = (firstSupplier?.city || "N/A").toString().slice(0, 60);
        const region = (firstSupplier?.region || "NCR").toString().slice(0, 30);
        const contactEmail = (firstSupplier?.contact_email || "supplier@example.com").toString().slice(0, 100);
        const contactNumber = (firstSupplier?.contact_number || "0000000000").toString().slice(0, 20);
        const supplierType = (firstSupplier?.supplier_type || "Distributor").toString().slice(0, 30);

        const supplierResult = await client.query(
          `INSERT INTO suppliers (supplier_name, supplier_address, city, region, contact_email, contact_number, supplier_type, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Active')
           ON CONFLICT (contact_email) DO UPDATE SET supplier_name = EXCLUDED.supplier_name
           RETURNING supplier_id`,
          [supplierName, supplierAddress, city, region, contactEmail, contactNumber, supplierType]
        );
        supplierId = supplierResult.rows[0]?.supplier_id ?? null;
      }

      for (const row of item_rows) {
        const itemName = (row?.item_name || "Imported Item").toString().slice(0, 100);
        const material = (row?.material || "Imported").toString().slice(0, 100);
        const brand = (row?.brand || "Generic").toString().slice(0, 100);
        const unit = (row?.unit || "pcs").toString().slice(0, 30);
        const categoryId = Number(row?.category_id ?? 1);
        const itemSource = (row?.item_source || "Supplier").toString().slice(0, 20);
        const price = Number(row?.price ?? 0);

        const itemResult = await client.query(
          `INSERT INTO items (category_id, item_name, material, brand, unit, item_source)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING item_code`,
          [categoryId, itemName, material, brand, unit, itemSource]
        );

        const itemCode = itemResult.rows[0]?.item_code;
        if (itemCode) {
          const regionName = typeof row?.region === "string" && row.region.trim() ? row.region : "NCR";
          await client.query(
            `INSERT INTO historical_price_record (item_code, supplier_id, price_source, region, quarter, year, price)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [itemCode, supplierId, itemSource, regionName, "Q1", new Date().getFullYear(), price]
          );
        }
      }

      await client.query("COMMIT");
      return NextResponse.json({ saved_count: item_rows.length });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
