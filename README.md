# Wortgarten

## Setup

```
cp .env.example .env   # fill in BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET
docker compose up -d   # postgres
pnpm install
pnpm --filter @wortgarten/database db:generate
pnpm --filter @wortgarten/database exec prisma migrate deploy
pnpm --filter @wortgarten/database db:seed   # demo user only, see below
pnpm dev
```

`migrate deploy` applies the migrations already committed under
`packages/database/prisma/migrations`. Only reach for `prisma migrate dev`
when you're authoring a *new* migration from a schema change — and note it
refuses to run in non-interactive shells; generate the SQL with
`prisma migrate diff --from-url <DATABASE_URL> --to-schema-datamodel prisma/schema.prisma --script`,
hand-write it into a new `migrations/<timestamp>_<name>/migration.sql`, then
apply with `migrate deploy`.

`pnpm --filter @wortgarten/database db:seed` only creates the demo user
(`packages/database/prisma/seed.ts`) — no words. The actual German dictionary
(`Lexeme`/`Sense`/`WordForm`) and example-sentence corpus (`Example`/
`ExampleWord`) come from a separate, one-time importer: see
[`packages/seed/README.md`](packages/seed/README.md) for the pipeline
(kaikki/Wiktionary + Tatoeba, run on a laptop, not the VPS). Without it the
app has auth and UI but an empty dictionary — lookups return nothing.

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
