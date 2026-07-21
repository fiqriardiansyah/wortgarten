import { Body, Controller, Delete, Get, Patch, Query, Res } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import {
  AcceptTermsRequest,
  AcceptTermsResponse,
  DeleteAccountRequest,
  MeResponse,
  SetTimezoneRequest,
  SetTimezoneResponse,
  WordExportRow,
} from '@wortgarten/shared';
import { MeService } from './me.service';

function toCsv(rows: WordExportRow[]): string {
  const columns: (keyof WordExportRow)[] = [
    'word',
    'partOfSpeech',
    'translation',
    'level',
    'stability',
    'difficulty',
    'reps',
    'lapses',
    'dueAt',
    'lastReviewedAt',
    'addedAt',
  ];
  const escape = (value: unknown) => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => escape(row[col])).join(','));
  }
  return lines.join('\n');
}

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  getMe(@Session() session: UserSession): Promise<MeResponse> {
    return this.me.getProfile(session.user.id);
  }

  @Patch('timezone')
  setTimezone(@Session() session: UserSession, @Body() body: SetTimezoneRequest): Promise<SetTimezoneResponse> {
    return this.me.setTimezone(session.user.id, body.timezone);
  }

  @Get('export')
  async exportWords(
    @Session() session: UserSession,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const rows = await this.me.exportWords(session.user.id);
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="wortgarten-words.json"');
      return JSON.stringify(rows, null, 2);
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="wortgarten-words.csv"');
    return toCsv(rows);
  }

  @Patch('accept-terms')
  acceptTerms(@Session() session: UserSession, @Body() body: AcceptTermsRequest): Promise<AcceptTermsResponse> {
    return this.me.acceptTerms(session.user.id, body.version);
  }

  @Delete()
  async deleteAccount(@Session() session: UserSession, @Body() body: DeleteAccountRequest): Promise<{ success: true }> {
    await this.me.deleteAccount(session.user.id, body.confirmEmail);
    return { success: true };
  }
}
