import { BadRequestException, Injectable } from '@nestjs/common';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { displayForm, localDateKey, type WordExportRow } from '@wortgarten/shared';
import { ImageService } from '@wortgarten/images';
import { isValidTimeZone } from '../streak/streak.service';
import { PrismaService } from '../prisma/prisma.service';
import { toLexemeSummary } from '../modules/lexicon/lexeme-summary';

const userWordWithLexeme = {
  sense: { include: { lexeme: true } },
} as const;

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const safeTimezone = isValidTimeZone(user.timezone) ? user.timezone : 'UTC';
    const now = new Date();
    const createdKey = localDateKey(user.createdAt, safeTimezone);
    const todayKey = localDateKey(now, safeTimezone);
    const dayNumber = differenceInCalendarDays(parseISO(todayKey), parseISO(createdKey)) + 1;

    return {
      user: { id: user.id, name: user.name, email: user.email, image: user.image },
      createdAt: user.createdAt.toISOString(),
      timezone: user.timezone,
      timezoneSetManually: user.timezoneSetManually,
      dayNumber,
    };
  }

  async setTimezone(userId: string, timezone: string) {
    if (!isValidTimeZone(timezone)) {
      throw new BadRequestException(`"${timezone}" is not a recognized timezone`);
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { timezone, timezoneSetManually: true },
    });
    return { timezone: user.timezone, timezoneSetManually: user.timezoneSetManually };
  }

  async exportWords(userId: string): Promise<WordExportRow[]> {
    const rows = await this.prisma.userWord.findMany({
      where: { userId },
      include: userWordWithLexeme,
      orderBy: { addedAt: 'asc' },
    });

    return rows.map((userWord) => {
      const lexeme = toLexemeSummary(userWord.sense.lexeme);
      return {
        word: displayForm(lexeme),
        partOfSpeech: lexeme.partOfSpeech,
        translation: userWord.customTranslation ?? userWord.sense.translation,
        level: userWord.level,
        stability: userWord.stability,
        difficulty: userWord.difficulty,
        reps: userWord.reps,
        lapses: userWord.lapses,
        dueAt: userWord.dueAt.toISOString(),
        lastReviewedAt: userWord.lastReviewedAt?.toISOString() ?? null,
        addedAt: userWord.addedAt.toISOString(),
      };
    });
  }

  async acceptTerms(userId: string, version: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { acceptedTermsAt: new Date(), acceptedTermsVersion: version },
    });
    return { acceptedTermsAt: user.acceptedTermsAt!.toISOString(), acceptedTermsVersion: user.acceptedTermsVersion! };
  }

  async deleteAccount(userId: string, confirmEmail: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException('Confirmation email does not match your account email');
    }

    const stories = await this.prisma.story.findMany({
      where: { userId, coverImageKey: { not: null } },
      select: { coverImageKey: true },
    });
    for (const story of stories) {
      if (story.coverImageKey) await this.images.deleteStoryCover(story.coverImageKey);
    }

    // Verification rows key on email, not userId — no FK cascade covers them.
    await this.prisma.verification.deleteMany({ where: { identifier: user.email } });
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
