import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ historicalrecId: string }> }) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { historicalrecId } = await params;
  const recordId = Number(historicalrecId);
  if (!Number.isInteger(recordId)) {
    return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
  }

  const result = await pool.query<{ historicalrec_id: number }>(
    `DELETE FROM historical_price_record
     WHERE historicalrec_id = $1
       AND price_source = 'DPWH'
     RETURNING historicalrec_id`,
    [recordId]
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "DPWH price record not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
