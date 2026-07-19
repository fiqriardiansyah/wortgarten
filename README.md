# Wortgarten

## Setup

### 1. Configure environment variables

```
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` — defaults match `docker-compose.yml` (`postgres`/`postgres`), only
  change if you're pointing at a different Postgres.
- `BETTER_AUTH_SECRET` — long random string, e.g. `openssl rand -base64 32`.
- `BETTER_AUTH_URL` — the API's own base URL (default `http://localhost:3026`).
- `WEB_ORIGIN` — comma-separated web app origin(s) for CORS/trustedOrigins (default
  `http://localhost:5173`).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — see [Google OAuth](#google-oauth) below.

Prisma only auto-loads a `.env` sitting next to `schema.prisma`, not one at the repo
root, so copy it down into the database package too:

```
cp .env packages/database/.env
```

### 2. Start Postgres

```
docker compose up -d
```

### 3. Install dependencies

```
pnpm install
```

### 4. Generate the Prisma client

```
pnpm --filter @wortgarten/database db:generate
```

### 5. Run migrations

```
pnpm --filter @wortgarten/database exec prisma migrate deploy
```

This applies the migrations already committed under
`packages/database/prisma/migrations`. Only reach for `prisma migrate dev`
when you're authoring a *new* migration from a schema change — and note it
refuses to run in non-interactive shells; generate the SQL with
`prisma migrate diff --from-url <DATABASE_URL> --to-schema-datamodel prisma/schema.prisma --script`,
hand-write it into a new `migrations/<timestamp>_<name>/migration.sql`, then
apply with `migrate deploy`.

### 6. Seed the demo user

```
pnpm --filter @wortgarten/database db:seed
```

This only creates the demo user (`packages/database/prisma/seed.ts`) — no words.
The actual German dictionary (`Lexeme`/`Sense`/`WordForm`) and example-sentence
corpus (`Example`/`ExampleWord`) come from a separate, one-time importer: see
[`packages/seed/README.md`](packages/seed/README.md) for the pipeline
(kaikki/Wiktionary + Tatoeba, run on a laptop, not the VPS). Without it the
app has auth and UI but an empty dictionary — lookups return nothing.

### 7. Run the app

```
pnpm dev
```

Starts everything through Turborepo: `apps/web` (Vite, default
`http://localhost:5173`), `apps/api` (Nest, default `http://localhost:3026`), and
`apps/worker`.

## UI copy rule

Enums are for code. Sentences are for users. Any `ALL_CAPS_STRING` that reaches
the screen is a bug; translate enums through the shared display maps.

## Google OAuth

Create an OAuth 2.0 Client in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
and set the authorized redirect URI to Better Auth's callback:

- Dev: `{BETTER_AUTH_URL}/auth/callback/google` (e.g. `http://localhost:3026/auth/callback/google`)
- Prod: `https://your-domain/auth/callback/google`

Put the resulting client ID/secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Note: Better Auth's own basePath is `/auth` (not the default `/api/auth`) so it lines
up with this repo's convention of the API never seeing an `/api` prefix — the web
app's dev Vite proxy (and Caddy in prod) strips `/api` before forwarding to the API.
The web app talks to `{origin}/api/auth`; the browser only ever hits the API directly
for the one OAuth redirect hop to Google, which is expected.

## Story generation batch — runbook

Every user gets at most one NEW story per day (their own timezone, not UTC) — see
`isEligibleForNewStory` (`packages/ai/src/story/eligibility.ts`). Two things produce a
story:

- **Lazy**, daytime: `GET /stories` fires a fire-and-forget generation if the user is
  eligible. Remote-only (GROQ) — if the free quota is exhausted it does nothing and
  waits for the batch below, rather than loading the local Ollama model into RAM while
  the API is serving requests.
- **Batch**, overnight: `apps/worker`'s `story:batch` job, covering everyone the lazy
  path didn't already catch during the day. Uses the full router (GROQ while quota
  lasts, then local Ollama) since it's not competing with live request RAM.

**Nothing currently schedules the batch job** — there is no cron/systemd timer wired up
yet. At the current user count the lazy path plus an occasional manual run is enough;
see below for how to actually schedule it once that stops being true.

### Running it manually

```
pnpm --filter @wortgarten/worker story:batch
```

Reads `.env` the same way the rest of the app does. Relevant env vars (all optional,
see `.env.example`): `STORY_ELIGIBLE_ACTIVE_DAYS` (default 7), `STORY_BATCH_MAX`
(default 200), `STORY_BATCH_DEADLINE` (default `05:30`, local server time).

### Reading the summary log line

```
[story:batch] done — eligible=42 attempted=38 shipped=31 skipped=7 deferredByCap=4
```

- **eligible** — candidates the SQL pre-filter found (recently active, no unread story).
  Not yet the authoritative check; see below.
- **attempted** — of those, how many actually got as far as an AI call. A candidate can
  be `eligible` but not `attempted` if the per-user `isEligibleForNewStory` re-check
  fails (typically: they already got a story today, generated earlier by the lazy path)
  — look for `skipped user <id>: not_eligible` lines just above the summary.
  `not_eligible` skips don't count against `STORY_BATCH_MAX`.
- **shipped** — a story was generated, passed the checker and the coverage floor, and
  was written to the DB. Look for `shipped story <id> for user <id>` lines.
- **skipped** — attempted but nothing was stored. The per-user line just above states
  why: `too_few_known_words` (vocabulary floor), a checker-failure reason
  (`BAD_JSON` / `EMPTY` / `TOO_LONG` / `USED_DISALLOWED_WORD` / `OTHER` — the model's
  output didn't check out even after retries), `low_coverage_<n>pct` (checker passed
  but too much of the story ended up outside the user's known/function/new allowlist),
  or `not_eligible` (see above).
- **deferredByCap** — candidates never reached at all because `STORY_BATCH_MAX` or
  `STORY_BATCH_DEADLINE` was hit first; they roll over to tomorrow's run automatically
  (nothing to clean up).

### Verifying stories landed

```sql
select "userId", title, "createdAt", "coverageKnownPct"
from "Story"
where "createdAt" > now() - interval '1 day'
order by "createdAt" desc;
```

Or from the app: any user who got a story sees it on Home (the story card flips from
"brewing" to the real title) and in their Read library.

### Scheduling it (paste-ready, not yet wired up)

Pick ONE of these — don't run both. Both assume a checkout at `/opt/wortgarten` with
`.env` at the repo root; adjust the path.

**crontab** (`crontab -e`), nightly at 3:00 AM server time, well before the default
05:30 deadline:

```cron
0 3 * * * cd /opt/wortgarten && pnpm --filter @wortgarten/worker story:batch >> /var/log/wortgarten-story-batch.log 2>&1
```

**systemd timer** — `/etc/systemd/system/wortgarten-story-batch.service`:

```ini
[Unit]
Description=Wortgarten nightly story generation batch

[Service]
Type=oneshot
WorkingDirectory=/opt/wortgarten
ExecStart=/usr/bin/pnpm --filter @wortgarten/worker story:batch
```

`/etc/systemd/system/wortgarten-story-batch.timer`:

```ini
[Unit]
Description=Run the Wortgarten story batch nightly

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable with `systemctl enable --now wortgarten-story-batch.timer`.
