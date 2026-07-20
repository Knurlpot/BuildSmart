import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_PREFIX = "image/";

function extensionFromMimeType(mimeType: string): string {
  const subtype = mimeType.split("/")[1]?.toLowerCase() || "";
  if (subtype === "jpeg") return "jpg";
  if (subtype === "svg+xml") return "svg";
  if (/^[a-z0-9.+-]+$/.test(subtype)) return subtype;
  return "bin";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
    }

    if (!fileEntry.type.startsWith(ALLOWED_MIME_PREFIX)) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }

    if (fileEntry.size === 0) {
      return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
    }

    if (fileEntry.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Maximum allowed size is 5MB." },
        { status: 400 }
      );
    }

    const ext = extensionFromMimeType(fileEntry.type);
    const fileName = `${Date.now()}-${randomUUID()}.${ext}`;

    const relativeDir = path.join("uploads", "company-logos");
    const absoluteDir = path.join(process.cwd(), "public", relativeDir);
    await mkdir(absoluteDir, { recursive: true });

    const absoluteFilePath = path.join(absoluteDir, fileName);
    const bytes = Buffer.from(await fileEntry.arrayBuffer());
    await writeFile(absoluteFilePath, bytes);

    return NextResponse.json({ url: `/${relativeDir}/${fileName}` }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload company logo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
