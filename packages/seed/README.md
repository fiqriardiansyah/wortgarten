# @wortgarten/seed

Fills the database with real German words and example sentences. Run once, on
your own laptop — not the VPS (needs a lot of RAM and disk).

Never used by `apps/api` or `apps/web` while the app runs. It just writes to
Postgres directly.

## Before you start

You need two files, both gitignored — download them yourself.

**1. Wiktionary word data**

Download this into `packages/seed/data/raw-wiktextract-data.jsonl.gz`:

```
https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz
```

⚠️ Don't use kaikki's `de-extract.jsonl` file instead — that one has German
explanations, not English ones. We want the file above.

**2. A German word-frequency list**

Any `word count` list works. Recommended:
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) →
`content/2018/de/de_50k.txt`. Save it somewhere under `packages/seed/data/`.

**3. (For example sentences) Tatoeba sentence pairs**

Download `deu-eng.tsv` from [tatoeba.org/en/downloads](https://tatoeba.org/en/downloads)
into `packages/seed/data/deu-eng.tsv`.

## Run it — step by step

Run these in order. Each step reads the previous step's output.

```
# 1. Keep only German entries from the Wiktionary file
pnpm --filter @wortgarten/seed run seed:filter -- --force

# 2. Rank words by real-world frequency, keep the top 5000
pnpm --filter @wortgarten/seed run seed:rank -- --freq data/de_50k.txt --limit 5000

# 3. Load those words into the database
pnpm --filter @wortgarten/seed run seed:load -- --truncate

# 4. Load example sentences from Tatoeba
pnpm --filter @wortgarten/seed run seed:examples --source tatoeba

# 5. Match sentences to the words they contain
pnpm --filter @wortgarten/seed run seed:index

# 6. Check everything loaded correctly
pnpm --filter @wortgarten/seed run seed:verify
```

**Windows note:** steps 1–3 need the extra `--` before flags. Step 4 does
**not** — `pnpm run seed:examples -- --source tatoeba` (with `--`) silently
drops the flag on Windows. Copy the commands above exactly.

Safe to re-run any step — nothing gets duplicated. Step 6 (`seed:verify`)
prints a report at the end: how many words loaded, how many have example
sentences, and any real bugs it caught.

## Attribution (required before shipping)

- Wiktionary data is CC-BY-SA/GFDL — credit Wiktionary + kaikki.org somewhere
  in the app (not done yet).
- Tatoeba sentences are CC BY 2.0 FR — already credited per-sentence via
  `Example.sourceRef`.
- Share-alike terms may affect redistributing the dictionary data commercially
  — not legal advice, review before launch.
