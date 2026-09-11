import "server-only";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { imageStorageRoot } from "@/lib/server/image-storage";
import { imageFileError, MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "@/lib/image-upload-policy";

export class ImageUploadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// Bound multipart bytes as they arrive, even without Content-Length.
export async function readImageFile(request: Request): Promise<File> {
  const maxBodyBytes = MAX_IMAGE_BYTES + 1024 * 1024;
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) throw new ImageUploadError("Choose an image to upload.");
  if (Number(request.headers.get("content-length")) > maxBodyBytes) throw new ImageUploadError("Upload is too large. Choose an image under 5 MB.", 413);
  if (!request.body) throw new ImageUploadError("No file was uploaded.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        throw new ImageUploadError("Upload is too large. Choose an image under 5 MB.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "content-type": type } }).formData(); }
  catch { throw new ImageUploadError("The upload could not be read. Please select the image again."); }
  const files = form.getAll("file");
  if (files.length !== 1 || !(files[0] instanceof File)) throw new ImageUploadError("Choose one image to upload.");
  return files[0];
}

export async function prepareImage(file: File): Promise<{ bytes: Buffer; extension: "jpg" | "png" }> {
  const problem = imageFileError(file);
  if (problem) throw new ImageUploadError(problem, file.size > MAX_IMAGE_BYTES ? 413 : 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (bytes.length !== file.size || (file.type === "image/png" ? !isPng : !isJpeg)) throw new ImageUploadError("This file is not a valid JPG or PNG image.");
  try {
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_IMAGE_PIXELS });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new ImageUploadError("Image dimensions are too large. Use at most 16 megapixels and 8,192 px per side.");
    }
    if ((metadata.pages ?? 1) > 1) throw new ImageUploadError("Animated images are not supported. Please choose a still JPG or PNG.");
    // Full decode, EXIF orientation correction and metadata removal; no source bytes are saved.
    const extension = file.type === "image/png" ? "png" : "jpg";
    const pipeline = image.rotate();
    const clean = await (extension === "png" ? pipeline.png() : pipeline.jpeg({ quality: 90 })).toBuffer();
    if (clean.length > MAX_IMAGE_BYTES) throw new ImageUploadError("The processed image is too large. Please choose a smaller image.", 413);
    return { bytes: clean, extension };
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    throw new ImageUploadError("This image could not be decoded or exceeds the 16-megapixel limit. Please export a smaller JPG or PNG and try again.");
  }
}

export async function storeImage(request: Request, directory: "company-logos" | "profile-pictures", ownerId: number): Promise<string> {
  if (!Number.isSafeInteger(ownerId) || ownerId < 1) throw new Error("Invalid upload owner");
  const { bytes, extension } = await prepareImage(await readImageFile(request));
  const name = `${randomUUID()}.${extension}`;
  const folder = path.join(imageStorageRoot(), directory, String(ownerId));
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, name), bytes, { flag: "wx" });
  return `/api/uploads/images/${directory}/${ownerId}/${name}`;
}
