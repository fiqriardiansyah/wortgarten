import type { ZodType, ZodTypeDef } from 'zod';

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, schema: ZodType<T, ZodTypeDef, unknown>, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    throw new ApiError(`API ${path} returned ${res.status}`, res.status);
  }
  const json = await res.json();
  try {
    return schema.parse(json);
  } catch (error) {
    console.error(`Invalid response shape from API ${path}`, error);
    throw error;
  }
}

/** POST/PATCH/DELETE with a JSON body, validated against `schema` on the way back. */
export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
  body?: unknown,
): Promise<T> {
  return apiFetch(path, schema, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
