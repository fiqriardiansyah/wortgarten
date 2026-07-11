import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@wortgarten/database';
import { emailSender } from './email/email-sender';

const prisma = new PrismaClient();

export function createAuth(configService: ConfigService) {
  const webOrigins = (configService.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim());

  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    basePath: '/auth',
    baseURL: configService.get<string>('BETTER_AUTH_URL') ?? 'http://localhost:3026',
    secret: configService.get<string>('BETTER_AUTH_SECRET'),
    trustedOrigins: webOrigins,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await emailSender.send({
          to: user.email,
          subject: 'Reset your Wortgarten password',
          text: `Click the link to reset your password: ${url}`,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await emailSender.send({
          to: user.email,
          subject: 'Verify your Wortgarten email',
          text: `Click the link to verify your email: ${url}`,
        });
      },
    },
    socialProviders: {
      google: {
        clientId: configService.get<string>('GOOGLE_CLIENT_ID') ?? '',
        clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') ?? '',
      },
    },
    account: {
      accountLinking: {
        enabled: true,
      },
    },
  });
}
