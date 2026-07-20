import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

function getMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".svg") || lower.endsWith(".svg+xml")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

export async function GET(request: NextRequest) {
  const relativePath = request.nextUrl.searchParams.get("path") || "";
  const normalized = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;

  // Restrict reads to the uploads folder under /public.
  if (!normalized.startsWith("/uploads/")) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  const absolutePath = path.join(process.cwd(), "public", normalized.replace(/^\/+/, ""));
  try {
    const bytes = await readFile(absolutePath);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": getMimeType(normalized),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
