import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

// Deletes only this one Supplier price observation, not the underlying Items
// row or its other price history — matches how the sibling GET in
// ../route.ts scopes to price_source = 'Supplier' and the caller's own
// company, so a guessed id can't delete another company's or another
// source's record.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ historicalrecId: string }> }) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { historicalrecId } = await params;
  const recordId = Number(historicalrecId);
  if (!Number.isInteger(recordId)) {
    return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
  }

  const result = await pool.query(
    `DELETE FROM historical_price_record hp
     USING items i
     WHERE hp.historicalrec_id = $1
       AND hp.item_code = i.item_code
       AND hp.price_source = 'Supplier'
       AND (i.company_id IS NULL OR i.company_id = (SELECT company_id FROM users WHERE user_id = $2))
     RETURNING hp.historicalrec_id`,
    [recordId, session.userId]
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Price record not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
