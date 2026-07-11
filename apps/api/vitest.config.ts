import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

// Tests hit a real Postgres instance (fixtures + cleanup, no mocking the DB
// layer) — load DATABASE_URL etc. from the repo-root .env the same way the
// app does, since vitest doesn't go through Nest's ConfigModule.
const envPath = resolve(__dirname, '../../.env');
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

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
