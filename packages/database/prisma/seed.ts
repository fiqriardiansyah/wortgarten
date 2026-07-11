import { PrismaClient } from '../generated/prisma';

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
