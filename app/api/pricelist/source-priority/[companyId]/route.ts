import { NextResponse } from "next/server";

import { getNormalizationApiBaseUrl } from "@/lib/server/config";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;

    const response = await fetch(`${getNormalizationApiBaseUrl()}/pricelist/source-priority/${companyId}`, {
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
    console.error("API request failed", error);
    return NextResponse.json(
      { error: "Failed to fetch source priority. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const body = await request.json();

    const response = await fetch(`${getNormalizationApiBaseUrl()}/pricelist/source-priority/${companyId}`, {
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
    console.error("API request failed", error);
    return NextResponse.json(
      { error: "Failed to update source priority. Please try again." },
      { status: 500 }
    );
  }
}
