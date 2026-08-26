import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { clearSessionCookie, readSession } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query<{ company_id: number }>(
      `SELECT company_id
       FROM users
       WHERE user_id = $1
         AND status = 'Active'
       LIMIT 1`,
      [session.userId]
    );
    const companyId = userResult.rows[0]?.company_id;

    if (!companyId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // Remove company-owned rows that otherwise detach via ON DELETE SET NULL.
    await client.query("DELETE FROM price_list_review_item WHERE company_id = $1", [companyId]);
    await client.query("DELETE FROM items WHERE company_id = $1", [companyId]);

    // Quotation references users without ON DELETE CASCADE, so remove quotations before
    // deleting the company, which cascades the users row and the rest of company data.
    await client.query("DELETE FROM quotation WHERE company_id = $1", [companyId]);

    const deletedCompany = await client.query(
      "DELETE FROM company WHERE company_id = $1 RETURNING company_id",
      [companyId]
    );

    if (!deletedCompany.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Could not delete account.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }

  const response = NextResponse.json({ deleted: true });
  clearSessionCookie(response);
  return response;
}
