# @wortgarten/seed

One-time, resumable, streaming importer that fills the shared German dictionary
(`Lexeme` / `Sense` / `WordForm`) from a Wiktionary extract, ranked by real-world
word frequency. Run this **on a laptop**, not the VPS — the raw extract is ~2.6GB
compressed / ~22GB decompressed, and the VPS has 4GB RAM and no business doing this.

This package is never imported by `apps/api` or `apps/web`. It talks to Postgres
directly via `@wortgarten/database`.

## Inputs

### 1. The Wiktionary extract

```
https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz
```

One JSON object per line, **all languages**. Pass 1 keeps only `lang_code === "de"`.

**⚠️ Trap:** kaikki also publishes `de-extract.jsonl` — the **German edition** of
Wiktionary. Its glosses are **in German**. That is *not* what we want: we want
German words with **English** glosses, i.e. German-language entries from the
**English** edition, which is what the raw multi-language file above gives you
after filtering by `lang_code`.

There's also a smaller pre-filtered "German (from English edition)" file linked
at the bottom of https://kaikki.org/dictionary/German/index.html (~933MB). It's
marked **DEPRECATED** and may be removed — the raw stream above is the durable
default. If you use it anyway, point `--in` at it directly; `1-filter.ts` detects
`.gz` by extension and otherwise streams the file as-is, still applying the
pos-reject/archaic filtering.

Download it into `packages/seed/data/raw-wiktextract-data.jsonl.gz` (gitignored).

### 2. A German frequency list

A two-column `word<TAB|space>count` file, one entry per line. The script doesn't
care about the source — pass any path via `--freq`.

**Recommended:** an OpenSubtitles-derived list, e.g.
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)'s
`content/2018/de/de_50k.txt` (OpenSubtitles2018-based — reflects everyday spoken
German, which is what a learner actually wants). **Check that repo's current
license terms before use** and record what you used + its license below once
you've picked one:

- Frequency list used: `_(fill in — path/URL + license)_`
- Extract date used: `_(fill in — kaikki dump date)_`

Note: frequency lists count **word forms**, not lemmas (`ist`, `war`, `sind`,
`bin` are all separately "common", not obviously all `sein`). That's why ranking
happens in its own pass, after forms are known — see below.

## Pipeline

```
pnpm --filter @wortgarten/seed run seed:filter -- --force
pnpm --filter @wortgarten/seed run seed:rank -- --freq data/de_50k.txt --limit 5000
pnpm --filter @wortgarten/seed run seed:load -- --truncate
pnpm --filter @wortgarten/seed run seed:verify
```

Or all three load-bearing passes at once (`seed:all` does not take the `--freq`
flag through — run `seed:rank` once with `--freq` set, or export the flags you
need per-step): `pnpm --filter @wortgarten/seed run seed:all`.

### `seed:filter` (`src/1-filter.ts`) — shrink

Streams the `.gz` (gunzip piped in-line, never written to disk) and writes every
`lang_code === "de"` line to `data/german.jsonl`. Memory stays flat regardless of
input size — never buffers more than one line. Also drops here (cheap, so later
passes don't re-pay for it):

- non-word `pos` values: `name`, `phrase`, `proverb`, `character`, `punct`,
  `abbrev`, `prefix`, `suffix`, `infix`, `romanization`
- entries tagged `archaic` or `obsolete`

Malformed lines are skipped with a counter, not fatal. Progress logs every 1M
lines read. **Idempotent**: skips if `data/german.jsonl` already exists, unless
`--force` (this is the slow pass — don't re-pay for it on every iteration of the
later passes).

Flags: `--in <path>` (default `data/raw-wiktextract-data.jsonl.gz`), `--out <path>`
(default `data/german.jsonl`), `--force`.

### `seed:rank` (`src/2-rank.ts`) — score and choose

**The core insight:** a lemma's score is the *sum of the frequencies of all its
forms*, not the frequency of the lemma string itself. `sein` ranks high because
`ist` + `war` + `sind` + `bin` + … are all common — the frequency list alone
doesn't know these are the same word; the kaikki entry's `forms` array is what
connects them.

Loads the frequency list into memory (small), streams `german.jsonl`, and for
each real lemma entry (kaikki's standalone `form_of` entries — e.g. "Journals"
tagged as a form of "Journal" — are skipped here; they're not lemmas, they're
harvested as extra `WordForm` rows in Pass 3) sums `frequency[foldForLookup(surface)]`
over `{word, ...forms}`. Sorts descending, drops anything with score 0 (a word
nobody says isn't worth seeding), takes the top `--limit` (default 5000), writes
`data/ranked.json`.

Sanity-check the printed top 50 — it should look like real high-frequency German
(`sein`, `haben`, `werden`, `der`, `ich`, `nicht`, `und`, …). If it looks like
noise, the form roll-up is broken.

Flags: `--freq <path>` (required), `--in <path>` (default `data/german.jsonl`),
`--out <path>` (default `data/ranked.json`), `--limit <n>` (default 5000), `--force`.

### `seed:load` (`src/3-load.ts`) — map and insert

Streams `german.jsonl` once more, keeps only entries matching a key in
`ranked.json`, maps each to `Lexeme` / `Sense` / `WordForm` rows (`src/map.ts` —
see below), and batch-inserts (1000 rows/batch, one transaction per batch).

**Idempotent without `--truncate`:** each batch inserts `Lexeme` rows with
`skipDuplicates: true` against the `[language, lemma, partOfSpeech, gender]`
unique constraint, then only inserts that lexeme's `Sense`/`WordForm` children
if the row was newly created this run (checked by querying which of the
client-generated IDs actually landed). Re-running the whole pipeline never
duplicates rows.

`--truncate` clears existing `Lexeme` rows for `--language` first (cascades to
their `Sense`/`WordForm`) — **never** touches `UserWord`, auth tables, or
anything personal. Only safe to use before real users have added words from
this language's dictionary (if any `UserWord` already references a `Sense`
being cleared, the delete will fail on the FK rather than silently orphan data
— that's intentional).

Flags: `--in <path>` (default `data/german.jsonl`), `--ranked <path>` (default
`data/ranked.json`), `--language <code>` (default `de`), `--truncate`,
`--batch-size <n>` (default 1000).

Prints an end-of-run report: counts inserted, nouns missing gender/plural, verbs
with/without a separable prefix or auxiliary, and any ranked lemma that matched
zero raw entries (a data-quality gap, not a silent success).

### `seed:verify` (`src/verify.ts`)

Runs the fixture-style assertions the lookup service was already tested against
(`apps/api/src/modules/lexicon/lookup.service.test.ts`), but against the real
loaded data: `kommt→kommen`, `Hunde→Hund`, `schnelle→schnell`, `anrufen` has
`separablePrefix="an"` and *"Ich rufe dich an."* resolves to it as one match,
`Bank` has ≥2 senses, `See` has two lexemes with different genders, and
`der`/`die`/`das`/`sein`/`haben` are all present. If any fail, fix `map.ts`, not
the test. Flag: `--language <code>` (default `de`).

## `map.ts` — the domain logic, and its known limitations

- `lemma` / `partOfSpeech` / `gender`: straightforward from kaikki's `word`,
  `pos` (mapped through a fixed table; unmapped → `OTHER`), and top-level
  `tags`/`head_templates`.
- `plural`: prefers a form tagged `nominative` + `plural`, else the first
  `plural`-tagged form.
- `separablePrefix`: gated on an explicit `separable` tag/category (never
  inferred for words only tagged `inseparable`); prefers an explicit
  prefix-tagged form, else matches against a hardcoded list of known German
  separable prefixes against the lemma's own spelling. **Spot-checked against
  `anrufen` explicitly** per the task spec — verify this stays correct against
  the real dump (`seed:verify` checks it).
- `auxiliary` / `government`: best-effort. `auxiliary` reads `head_templates`
  args first, then falls back to scanning category names for "haben"/"sein
  auxiliary" phrasing. `government` (preposition + case, e.g. `warten` → `auf +
  Akkusativ`) is the weakest extraction — it regex-scans gloss/example text for
  a case marker plus a known preposition, which will miss anything not phrased
  that way in the source. Both are nullable by design; **don't trust
  `government` without spot-checking a sample.**
- `Sense`: one row per kaikki sense object (its `glosses` joined if a sense has
  several nested glosses), capped at 5 per lexeme, most-frequent/first-listed
  first.
- `WordForm`: the entry's own `word` + `forms` array, **plus** forms harvested
  from standalone `form_of` entries elsewhere in the file (matched back to the
  target lemma by lemma text + part of speech, and by gender when extractable).
  `normalized` is always `foldForLookup(surface)` — the same function
  `apps/api`'s `LookupService` queries with; a mismatch here would silently
  break every lookup in the app. The lemma itself is always included as a form.
  Deduplicated on `(surface, features)` per lexeme.

## Attribution (required)

Wiktionary data is **CC-BY-SA / GFDL**. The app must credit Wiktionary and note
kaikki.org / wiktextract as the extraction source (settings/about page — not yet
added; do this before shipping the dictionary import). Record the extract date
and the frequency list's license above once chosen.

**Share-alike may have implications for redistributing the derived dictionary
data.** This is not legal advice — review it before any commercial launch, don't
let it be a surprise later.
