import "server-only";

export function requireServerEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;

  throw new Error(`${name} is required`);
}

export function getNormalizationApiBaseUrl(): string {
  if (process.env.NODE_ENV === "production") {
    return requireServerEnv("NORMALIZATION_API_BASE_URL");
  }

  return process.env.NORMALIZATION_API_BASE_URL?.trim() || "http://localhost:8000";
}
