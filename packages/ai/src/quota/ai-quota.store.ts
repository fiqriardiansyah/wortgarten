import type { PrismaClient } from '@wortgarten/database';

export interface AiQuotaSnapshot {
  used: number;
  limit: number;
}

/** Only GROQ is quota-tracked — Ollama is local/unlimited, so there's nothing to meter. Backed
 * by the `AiQuota` table: the row IS the source of truth, never an in-memory counter that can
 * drift from it. */
export interface AiQuotaStore {
  getGroqUsage(dateKey: string): Promise<AiQuotaSnapshot>;
  recordGroqSuccess(dateKey: string): Promise<void>;
}

export class PrismaAiQuotaStore implements AiQuotaStore {
  constructor(
    private readonly aiQuota: PrismaClient['aiQuota'],
    private readonly dailyLimit: number,
  ) {}

  async getGroqUsage(dateKey: string): Promise<AiQuotaSnapshot> {
    // Upsert-on-read: the first check of a new UTC day creates that day's row with the
    // configured limit, so the row always reflects the limit in effect — no separate
    // "seed today's row" migration/cron step needed.
    const row = await this.aiQuota.upsert({
      where: { date_source: { date: new Date(dateKey), source: 'GROQ' } },
      update: {},
      create: { date: new Date(dateKey), source: 'GROQ', used: 0, limit: this.dailyLimit },
    });
    return { used: row.used, limit: row.limit };
  }

  async recordGroqSuccess(dateKey: string): Promise<void> {
    // Atomic increment via Prisma — never read-modify-write in application code, which is
    // exactly the kind of in-memory counter that drifts from the row under concurrent calls.
    await this.aiQuota.upsert({
      where: { date_source: { date: new Date(dateKey), source: 'GROQ' } },
      update: { used: { increment: 1 } },
      create: { date: new Date(dateKey), source: 'GROQ', used: 1, limit: this.dailyLimit },
    });
  }
}
