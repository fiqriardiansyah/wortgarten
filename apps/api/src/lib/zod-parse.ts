import { BadRequestException } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/** Validates a request body/query against a zod schema, or throws a 400 with the first issue's message. */
export function parseOrBadRequest<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Invalid request');
  }
  return result.data;
}
