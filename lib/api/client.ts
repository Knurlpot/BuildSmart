const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
export async function apiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}