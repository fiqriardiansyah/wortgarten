import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '../generated/prisma';

// ts-node runs this outside Nest's ConfigModule, so DATABASE_URL etc. must be
// loaded from the repo-root .env by hand (same approach as apps/api/vitest.config.ts).
const envPath = resolve(__dirname, '../../../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const prisma = new PrismaClient();

// Dictionary (Lexeme/Sense/WordForm) and word-bank fixtures are seeded by the
// dictionary import task, not here. This only ensures the demo user exists.
async function main() {
  await prisma.user.upsert({
    where: { email: 'dinda@example.com' },
    update: {},
    create: {
      name: 'Dinda',
      email: 'dinda@example.com',
      tagline: 'Learning German 🇩🇪',
    },
  });

  console.log('Seed complete');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
