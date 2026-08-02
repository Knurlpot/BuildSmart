import "server-only";

import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

export type AuthContext = {
  userId: number;
  companyId: number;
};

export type PricedLine = {
  item_code: number;
  supplier_id: number | null;
  quantity: number;
  unit_cost: number;
  source_type: "DPWH" | "PSA" | "Supplier" | "Internal";
  source_price_id: number;
  total_cost: number;
};

type PriceRecord = {
  historicalrec_id: number;
  item_code: number;
  supplier_id: number | null;
  price_source: "DPWH" | "PSA" | "Supplier" | "Internal";
  price: number;
};

export async function authContext(request: NextRequest): Promise<AuthContext | NextResponse> {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await pool.query<{ company_id: number }>("SELECT company_id FROM users WHERE user_id = $1 LIMIT 1", [
    session.userId,
  ]);
  const companyId = user.rows[0]?.company_id;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return { userId: session.userId, companyId };
}

export function isAuthContext(value: AuthContext | NextResponse): value is AuthContext {
  return !(value instanceof NextResponse);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getLatestPrice(
  client: PoolClient,
  itemCode: number,
  supplierId: number | null,
  region: string
): Promise<PriceRecord | null> {
  const values: unknown[] = [itemCode, region];
  const supplierFilter = supplierId == null ? "h.supplier_id IS NULL" : `h.supplier_id = $${values.push(supplierId)}`;

  const result = await client.query<PriceRecord>(
    `SELECT h.historicalrec_id, h.item_code, h.supplier_id, h.price_source, h.price::float AS price
     FROM historical_price_record h
     WHERE h.item_code = $1
       AND (h.region = $2 OR h.region IS NULL)
       AND ${supplierFilter}
     ORDER BY
       CASE WHEN h.region = $2 THEN 0 ELSE 1 END,
       h.effective_date DESC,
       h.recorded_at DESC,
       h.historicalrec_id DESC
     LIMIT 1`,
    values
  );

  return result.rows[0] ?? null;
}

async function applyCompanyRules(client: PoolClient, itemCode: number, companyId: number, basePrice: number) {
  const result = await client.query<{ conversion_factor: number | null; wastage_allowance_percentage: number }>(
    `SELECT rcd.conversion_factor::float AS conversion_factor,
            rcd.wastage_allowance_percentage::float AS wastage_allowance_percentage
     FROM rule_category_detail rcd
     JOIN company_rule cr ON cr.rule_id = rcd.rule_id
     WHERE cr.company_id = $1
       AND cr.status = 'Active'
       AND rcd.preferred_item_code = $2
     ORDER BY cr.date_created DESC
     LIMIT 1`,
    [companyId, itemCode]
  );

  const rule = result.rows[0];
  if (!rule) return basePrice;

  const converted = rule.conversion_factor ? basePrice * rule.conversion_factor : basePrice;
  return converted + converted * ((rule.wastage_allowance_percentage ?? 0) / 100);
}

async function applySupplierDiscount(
  client: PoolClient,
  supplierId: number | null,
  companyId: number,
  unitPrice: number,
  quantity: number
) {
  if (supplierId == null) return unitPrice;

  const result = await client.query<{
    rule_type: "Bulk Discount" | "Negotiated Price";
    minimum_order_amount: number | null;
    discount_percentage_rate: number | null;
    fixed_discount_amount: number | null;
  }>(
    `SELECT rule_type,
            minimum_order_amount::float AS minimum_order_amount,
            discount_percentage_rate::float AS discount_percentage_rate,
            fixed_discount_amount::float AS fixed_discount_amount
     FROM supplier_discount_rule
     WHERE supplier_id = $1
       AND company_id = $2
       AND is_active = TRUE
       AND effective_date <= CURRENT_DATE
       AND (expiration_date IS NULL OR expiration_date > CURRENT_DATE)
       AND rule_type IN ('Bulk Discount', 'Negotiated Price')
     ORDER BY effective_date DESC, supplierdisc_id DESC
     LIMIT 1`,
    [supplierId, companyId]
  );

  const rule = result.rows[0];
  if (!rule) return unitPrice;

  if (rule.rule_type === "Negotiated Price" && rule.fixed_discount_amount != null) {
    return rule.fixed_discount_amount;
  }

  if (rule.rule_type === "Bulk Discount") {
    const minimum = rule.minimum_order_amount ?? 0;
    if (quantity * unitPrice < minimum) return unitPrice;
    if (rule.discount_percentage_rate != null) return unitPrice * (1 - rule.discount_percentage_rate / 100);
    if (rule.fixed_discount_amount != null) return Math.max(0, unitPrice - rule.fixed_discount_amount);
  }

  return unitPrice;
}

export async function priceLine(
  client: PoolClient,
  companyId: number,
  projectRegion: string,
  itemCode: number,
  quantity: number,
  supplierId: number | null
): Promise<PricedLine> {
  const latest = await getLatestPrice(client, itemCode, supplierId, projectRegion);
  if (!latest) {
    throw new Error(`No price found for item ${itemCode}${supplierId == null ? "" : ` from supplier ${supplierId}`}`);
  }

  const ruled = await applyCompanyRules(client, itemCode, companyId, latest.price);
  const finalUnit = await applySupplierDiscount(client, supplierId, companyId, ruled, quantity);
  const unitCost = Number(finalUnit.toFixed(2));

  return {
    item_code: itemCode,
    supplier_id: supplierId,
    quantity,
    unit_cost: unitCost,
    source_type: latest.price_source,
    source_price_id: latest.historicalrec_id,
    total_cost: Number((unitCost * quantity).toFixed(2)),
  };
}
