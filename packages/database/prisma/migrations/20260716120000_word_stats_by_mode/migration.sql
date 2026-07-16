-- Add the reconstructible, display-only aggregate cache.
ALTER TABLE "UserWord"
ADD COLUMN "statsByMode" JSONB NOT NULL DEFAULT '{}';

-- Backfill from first attempts only. Retry attempts must never affect these counts.
WITH "modeCounts" AS (
  SELECT
    "userWordId",
    "taskType",
    COUNT(*)::INTEGER AS "total",
    COUNT(*) FILTER (WHERE "result" IN ('CORRECT', 'CORRECT_WITH_TYPO'))::INTEGER AS "correct"
  FROM "Attempt"
  WHERE "isRetry" = FALSE
    AND "taskType" IN ('PICK_MEANING', 'TYPE_WORD', 'BUILD_SENTENCE')
  GROUP BY "userWordId", "taskType"
),
"wordStats" AS (
  SELECT
    "userWordId",
    jsonb_object_agg(
      "taskType"::TEXT,
      jsonb_build_object('total', "total", 'correct', "correct")
    ) AS "statsByMode"
  FROM "modeCounts"
  GROUP BY "userWordId"
)
UPDATE "UserWord" AS "word"
SET "statsByMode" = "wordStats"."statsByMode"
FROM "wordStats"
WHERE "word"."id" = "wordStats"."userWordId";
