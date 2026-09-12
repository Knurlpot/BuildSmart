const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

export async function apiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  const text = await res.text();
  const body = text
    ? (() => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })()
    : null;

  if (!res.ok) {
    throw new Error(body?.error || text || `API error: ${res.status}`);
  }
  if (res.status === 204 || !text) return undefined as T;
  return body as T;
}
