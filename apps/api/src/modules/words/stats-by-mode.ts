import { Prisma } from '@wortgarten/database';
import type { AttemptResult, DrillTaskType } from '@wortgarten/shared';
import { resultIsCorrect } from '@wortgarten/shared';

/** Atomically increments the display cache inside the same transaction that records the Attempt. */
export function incrementStatsByMode(
  tx: Prisma.TransactionClient,
  userWordId: string,
  taskType: DrillTaskType,
  result: AttemptResult,
) {
  const correctIncrement = resultIsCorrect(result) ? 1 : 0;

  return tx.$executeRaw(Prisma.sql`
    UPDATE "UserWord"
    SET "statsByMode" = jsonb_set(
      COALESCE("statsByMode"::jsonb, '{}'::jsonb),
      ARRAY[${taskType}]::text[],
      jsonb_build_object(
        'total', COALESCE(("statsByMode" -> ${taskType} ->> 'total')::integer, 0) + 1,
        'correct', COALESCE(("statsByMode" -> ${taskType} ->> 'correct')::integer, 0) + ${correctIncrement}
      ),
      true
    )
    WHERE "id" = ${userWordId}
  `);
}
