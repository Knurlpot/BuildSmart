import "server-only";
import path from "path";

export function imageStorageRoot(): string {
  const configured = process.env.IMAGE_UPLOAD_DIR?.trim();
  if (process.env.NODE_ENV === "production" && !configured) throw new Error("IMAGE_UPLOAD_DIR is required in production; configure a persistent private volume.");
  if (configured && !path.isAbsolute(configured)) throw new Error("IMAGE_UPLOAD_DIR must be an absolute path.");
  const root = path.resolve(configured || path.join(process.cwd(), ".local-uploads"));
  const publicRoot = path.resolve(process.cwd(), "public");
  const relative = path.relative(publicRoot, root);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("IMAGE_UPLOAD_DIR must be outside public.");
  return root;
}

export function imageLocation(kind: string, owner: string, file: string): string | null {
  if (!["company-logos", "profile-pictures"].includes(kind) || !/^[1-9]\d*$/.test(owner) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/.test(file)) return null;
  return path.join(imageStorageRoot(), kind, owner, file);
}
