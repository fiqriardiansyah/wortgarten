# Wortgarten

## Setup

```
cp .env.example .env   # fill in BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET
docker compose up -d   # postgres
pnpm install
pnpm --filter @wortgarten/database db:generate
pnpm --filter @wortgarten/database exec prisma migrate dev
pnpm dev
```

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
