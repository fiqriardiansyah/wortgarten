import { Injectable } from '@nestjs/common';
import { HomeDashboard, HomeDashboardSchema } from '@wortgarten/shared';

const MOCK: HomeDashboard = {
  greeting: 'Guten Morgen, Dinda! 👋',
  daySubtitle: 'Day 12 of learning German',
  streakDays: 4,
  session: {
    wordCount: 12,
    estMinutes: 5,
    taskBreakdown: { flashcards: 3, recalls: 6, sentenceBuilds: 3 },
    previewWords: ['der', 'Hund', 'läuft'],
  },
  rusty: {
    count: 7,
    wordsPreview: ['die Verabredung', 'anrufen', 'gestern'],
    extraCount: 4,
  },
  quest: {
    label: 'Master 10 words this week',
    current: 6,
    target: 10,
    rewardLabel: '4 more to earn your gold star ⭐',
  },
  garden: {
    collected: 214,
    mastered: 38,
    segments: { new: 120, learning: 56, mastered: 38 },
  },
  story: {
    id: 's1',
    title: 'Der schnelle Hund',
    coverage: '100%',
    minutes: 2,
  },
  recentlyAdded: [
    { german: 'das Fenster', native: 'window', level: 'new', isRusty: false },
    { german: 'schnell', native: 'fast', level: 'learning', isRusty: false },
    { german: 'die Katze', native: 'cat', level: 'new', isRusty: false },
  ],
  user: { name: 'Dinda', tagline: 'Learning German 🇩🇪' },
};

@Injectable()
export class HomeService {
  getDashboard(): HomeDashboard {
    return HomeDashboardSchema.parse(MOCK);
  }
}
