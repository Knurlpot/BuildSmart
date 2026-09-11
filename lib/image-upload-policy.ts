export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_IMAGE_DIMENSION = 8192;
export const IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png";
export const IMAGE_UPLOAD_HELP = "JPG or PNG · Maximum 5 MB · Up to 16 megapixels and 8,192 px per side";

export function imageFileError(file: { type: string; size: number }): string | null {
  if (!["image/jpeg", "image/png"].includes(file.type)) return "Only JPG or PNG images are allowed.";
  if (file.size === 0) return "This image file is empty. Please choose another image.";
  if (file.size > MAX_IMAGE_BYTES) return "Image is too large. Maximum allowed size is 5 MB.";
  return null;
}
