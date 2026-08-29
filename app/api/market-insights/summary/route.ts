import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/server/session";

type SummaryCategory = {
  category: string;
  average_variance_pct: number;
};

type SummarySupplier = {
  supplier_name: string;
  average_variance_pct: number | null;
  favorable_count: number;
  item_count: number;
};

type SummaryItem = {
  item_name: string;
  category: string;
  deviation_pct: number | null;
  primary_driver: string;
};

type SummaryPayload = {
  region: string;
  category_filter: string;
  average_variance_pct: number | null;
  average_unit_difference: number | null;
  comparable_count: number;
  unfavorable_count: number;
  market_driven_count: number;
  markup_driven_count: number;
  favorable_count: number;
  top_categories: SummaryCategory[];
  top_suppliers: SummarySupplier[];
  top_items: SummaryItem[];
};

function fallbackSummary(payload: SummaryPayload) {
  const scope = payload.category_filter === "All" ? payload.region : `${payload.category_filter} in ${payload.region}`;
  const tone =
    payload.average_variance_pct === null
      ? `There is not enough comparable data yet to explain pricing trends for ${scope}.`
      : payload.average_variance_pct > 0
        ? `Supplier pricing is running ${payload.average_variance_pct.toFixed(1)}% above the PSA-adjusted DPWH baseline for ${scope}.`
        : `Supplier pricing is ${Math.abs(payload.average_variance_pct).toFixed(1)}% below the PSA-adjusted DPWH baseline for ${scope}.`;

  const driver =
    payload.markup_driven_count > payload.market_driven_count
      ? "Most unfavorable items look more commercial than market-driven, so negotiation and supplier review should come first."
      : "Recent gaps are leaning more toward market movement than supplier markup, so contingency assumptions deserve a closer look.";

  const category = payload.top_categories[0]
    ? `${payload.top_categories[0].category} is the strongest variance category at ${payload.top_categories[0].average_variance_pct.toFixed(1)}%.`
    : "No category has enough comparable records yet.";

  const supplier = payload.top_suppliers[0]
    ? `${payload.top_suppliers[0].supplier_name} is currently the best-ranked supplier view based on the latest comparable items.`
    : "No supplier comparison is available yet.";

  return [tone, driver, category, supplier].join(" ");
}

function buildPrompt(payload: SummaryPayload) {
  return [
    "You are helping a construction estimator explain a price-trends dashboard.",
    "Use only the provided numbers. Do not invent figures.",
    "Write 3 short paragraphs in plain business English.",
    "Paragraph 1: overall pricing situation.",
    "Paragraph 2: likely driver mix and category hotspots.",
    "Paragraph 3: practical supplier/procurement action.",
    "Mention percentages only when present in the payload.",
    "Do not use markdown, bullet points, or headings.",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

async function callGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 280,
        },
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) return null;
  const body = await response.json().catch(() => null) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  } | null;

  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  return text || null;
}

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  void session;

  const payload = (await request.json().catch(() => null)) as SummaryPayload | null;
  if (!payload) {
    return NextResponse.json({ error: "Invalid summary payload." }, { status: 400 });
  }

  const fallback = fallbackSummary(payload);

  try {
    const prompt = buildPrompt(payload);
    const summary = await callGemini(prompt);
    return NextResponse.json({
      summary: summary ?? fallback,
      source: summary ? "gemini" : "fallback",
    });
  } catch {
    return NextResponse.json({
      summary: fallback,
      source: "fallback",
    });
  }
}
