import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const dinda = await prisma.user.upsert({
    where: { email: 'dinda@example.com' },
    update: {},
    create: {
      name: 'Dinda',
      email: 'dinda@example.com',
      tagline: 'Learning German 🇩🇪',
    },
  });

  await prisma.word.createMany({
    skipDuplicates: true,
    data: [
      { german: 'das Fenster', native: 'window', level: 'new', userId: dinda.id },
      { german: 'schnell', native: 'fast', level: 'learning', userId: dinda.id },
      { german: 'die Katze', native: 'cat', level: 'new', userId: dinda.id },
      { german: 'die Verabredung', native: 'appointment', level: 'learning', isRusty: true, userId: dinda.id },
      { german: 'anrufen', native: 'to call', level: 'learning', isRusty: true, userId: dinda.id },
      { german: 'gestern', native: 'yesterday', level: 'learning', isRusty: true, userId: dinda.id },
    ],
  });

  await prisma.story.upsert({
    where: { id: 's1' },
    update: {},
    create: {
      id: 's1',
      title: 'Der schnelle Hund',
      content: 'Der Hund läuft schnell durch den Park...',
      minutes: 2,
    },
  });

  console.log('Seed complete');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
