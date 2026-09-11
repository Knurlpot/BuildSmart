import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/server/session";
import { ImageUploadError, storeImage } from "@/lib/server/image-upload";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = readSession(request);
    if (!session) return NextResponse.json({ error: "Please sign in to upload an image." }, { status: 401 });
    return NextResponse.json({ url: await storeImage(request, "profile-pictures", session.userId) }, { status: 201 });
  } catch (error) {
    if (error instanceof ImageUploadError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Failed to upload profile picture", error);
    return NextResponse.json({ error: "Could not upload your profile picture. Please try again." }, { status: 500 });
  }
}
