import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_NORMALIZATION_API_BASE_URL || "http://localhost:8000";

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const { companyId } = params;

    const response = await fetch(`${API_BASE}/pricelist/source-priority/${companyId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch source priority from backend" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch source priority: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const { companyId } = params;
    const body = await request.json();

    const response = await fetch(`${API_BASE}/pricelist/source-priority/${companyId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to update source priority on backend" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to update source priority: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
