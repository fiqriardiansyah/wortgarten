ALTER TABLE "user" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE "UserStreak" (
    "userId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "freezesBanked" INTEGER NOT NULL DEFAULT 0,
    "lastLearningDay" TIMESTAMP(3),
    "lastComputedAt" TIMESTAMP(3),

    CONSTRAINT "UserStreak_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserStreak" ADD CONSTRAINT "UserStreak_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
