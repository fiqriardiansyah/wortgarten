import type { ZodSchema } from 'zod';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export async function apiFetch<T>(path: string, schema: ZodSchema<T>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API ${path} returned ${res.status}`);
  }
  const json = await res.json();
  return schema.parse(json);
}
