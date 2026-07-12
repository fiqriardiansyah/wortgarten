import type { ZodSchema } from 'zod';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export async function apiFetch<T>(path: string, schema: ZodSchema<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    throw new Error(`API ${path} returned ${res.status}`);
  }
  const json = await res.json();
  return schema.parse(json);
}

/** POST/PATCH/DELETE with a JSON body, validated against `schema` on the way back. */
export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  schema: ZodSchema<T>,
  body?: unknown,
): Promise<T> {
  return apiFetch(path, schema, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
