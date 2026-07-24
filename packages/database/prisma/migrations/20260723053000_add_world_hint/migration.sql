-- AlterTable
-- DEFAULT '' is transient: only 2 seeded World rows exist and seed:worlds immediately backfills
-- the real value on every row via upsert. Prisma's schema has no @default here on purpose.
ALTER TABLE "World" ADD COLUMN     "hint" TEXT NOT NULL DEFAULT '';
