import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/server/session";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

function hasExpectedImageSignature(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}

function extensionFromMimeType(mimeType: string): string {
    const subtype = mimeType.split("/")[1]?.toLowerCase() || "";
    if (subtype === "jpeg") return "jpg";
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

    if (!ALLOWED_IMAGE_TYPES.has(fileEntry.type)) {
      return NextResponse.json({ error: "Only JPG or PNG images are allowed" }, { status: 400 });
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
    if (bytes.length !== fileEntry.size) {
      return NextResponse.json({ error: "Uploaded file could not be read" }, { status: 400 });
    }
    if (!hasExpectedImageSignature(bytes, fileEntry.type)) {
      return NextResponse.json({ error: "Uploaded file is not a valid image" }, { status: 400 });
    }
    await writeFile(absoluteFilePath, bytes);

    return NextResponse.json({ url: `/${relativeDir}/${fileName}` }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload company logo", error);
    return NextResponse.json({ error: "Failed to upload company logo" }, { status: 500 });
  }
}
