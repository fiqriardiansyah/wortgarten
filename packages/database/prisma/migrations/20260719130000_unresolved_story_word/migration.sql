CREATE TABLE "UnresolvedStoryWord" (
    "id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sampleStoryId" TEXT,

    CONSTRAINT "UnresolvedStoryWord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnresolvedStoryWord_language_surface_key" ON "UnresolvedStoryWord"("language", "surface");
