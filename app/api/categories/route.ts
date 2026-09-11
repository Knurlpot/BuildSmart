import { NextResponse } from "next/server";
import { pool } from "@/lib/server/db";

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT category_id, category_type, category_desc
       FROM category
       ORDER BY category_type ASC`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("API request failed", error);
    return NextResponse.json(
      { error: "Failed to fetch categories. Please try again." },
      { status: 500 }
    );
  }
}
