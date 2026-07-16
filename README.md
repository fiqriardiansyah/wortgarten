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
