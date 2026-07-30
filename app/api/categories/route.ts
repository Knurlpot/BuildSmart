import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_NORMALIZATION_API_BASE_URL || "http://localhost:8000";

export async function GET() {
  try {
    const response = await fetch(`${API_BASE}/pricelist/categories`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch categories from backend" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch categories: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
