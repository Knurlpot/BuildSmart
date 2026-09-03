import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/server/session";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function extensionFromMimeType(mimeType: string): string {
  const subtype = mimeType.split("/")[1]?.toLowerCase() || "";
  if (subtype === "jpeg") return "jpg";
  if (subtype === "svg+xml") return "svg";
  if (/^[a-z0-9.+-]+$/.test(subtype)) return subtype;
  return "bin";
}

export async function POST(request: NextRequest) {
  if (!readSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
    }
    if (!fileEntry.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }
    if (fileEntry.size === 0) {
      return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
    }
    if (fileEntry.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "Image is too large. Maximum allowed size is 5MB." }, { status: 400 });
    }

    const fileName = `${Date.now()}-${randomUUID()}.${extensionFromMimeType(fileEntry.type)}`;
    const relativeDir = path.join("uploads", "client-profile-pictures");
    const absoluteDir = path.join(process.cwd(), "public", relativeDir);
    await mkdir(absoluteDir, { recursive: true });
    await writeFile(path.join(absoluteDir, fileName), Buffer.from(await fileEntry.arrayBuffer()));

    return NextResponse.json({ url: `/${relativeDir}/${fileName}` }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload client profile picture";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
