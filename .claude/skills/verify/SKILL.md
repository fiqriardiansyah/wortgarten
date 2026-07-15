---
name: verify
description: Repo-specific recipe for driving the running Wortgarten app to verify a change end-to-end.
---

# Verifying Wortgarten changes

Dev servers are usually already running (`pnpm dev` via turbo): API on
`http://localhost:3026`, web on `http://localhost:5173`. Check with:

```
netstat -ano | grep -E "3026|5173"
```

If not running, `pnpm dev` from repo root (needs `docker compose up -d` for
Postgres first).

## No browser automation tool in this environment

There is no Playwright/Puppeteer-style tool available here. For UI changes,
typecheck + read the component, then verify the underlying data contract
live via the API (below) — call out in the report that the rendered pixels
were not screenshotted.

## Getting an authenticated session without Google OAuth

Google OAuth needs real user interaction. Instead, sign up a throwaway user
with email+password (`emailAndPassword.enabled: true` in `apps/api/src/lib/auth.ts`,
no email verification required):

```bash
curl -s -i -X POST http://localhost:3026/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"verify-XXXX@example.com","password":"testpass1234","name":"Verify"}' \
  -c /tmp/cookies.txt
```

Grab the returned `user.id` from the JSON body. Use `-b /tmp/cookies.txt` on
subsequent curls to hit any authenticated route (`/home`, `/sessions`, `/words`, ...).

## Seeding fixture data directly (bypassing dictionary lookup)

Adding words through the real UI/API requires real `senseId`s from the
seeded `de` dictionary. For fixture setup (not the thing under test), it's
fine to write directly with the generated Prisma client — same pattern the
vitest suites use:

```js
// generated client lives at packages/database/generated/prisma, not src/
const { PrismaClient } = require('D:/private/wortgarten/packages/database/generated/prisma');
const prisma = new PrismaClient();
```

Run with `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/wortgarten" node <script>.js`
— ts-node/Nest's ConfigModule isn't in play for a bare script, so the env
var must be passed explicitly (same gotcha as `apps/api/vitest.config.ts`).

Node's `require('/tmp/...')` does NOT resolve the way Bash's `/tmp` does on
this Windows box — write scratch scripts under the session scratchpad dir
and pass absolute Windows-style paths, not `/tmp`.

## Always clean up

Throwaway users cascade-delete their `UserWord`/`DrillSession`/`Attempt`
rows (`onDelete: Cascade` on every `userId` FK), so deleting the `User` row
via a small Prisma script is enough:

```js
await prisma.user.delete({ where: { id: userId } });
```

Do this before ending the session — don't leave test users in the dev DB.

## Worked example (NEW-word cap + Home preview fix, 2026-07-15)

1. Signed up a fresh user → confirmed `GET /home` shows `session.wordCount: 0, isActive: false` on an empty bank.
2. Seeded 8 undrilled (`level: NEW, reps: 0`) real dictionary `UserWord` rows directly via Prisma.
3. `GET /home` → `session.wordCount: 4` (not 8) — cap confirmed live.
4. `POST /sessions` → `totalCount: 4, tasks.length: 4` — matches the preview exactly.
5. `GET /home` again → `isActive: true, wordCount: 4` ("Resume session · 4 left").
6. Submitted one attempt via `POST /sessions/:id/attempts` → `currentIndex: 1`.
7. `GET /home` again → `wordCount: 3` — resume count tracks `currentIndex` live.
8. Abandoned the session and deleted the test user to clean up.
