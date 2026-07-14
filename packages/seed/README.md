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

**Idempotent by construction:** `Lexeme`/`Sense`/`WordForm` ids are all
deterministic content hashes (see `contentId` in `map.ts`), upserted by id —
re-running the whole pipeline against unchanged data never duplicates or
re-mints a row. There is no `--truncate` flag; a lemma that drops out of the
current `ranked.json` (e.g. a `--limit` change, or a ranking fix that changes
which candidates qualify) is simply not touched by that run and is left as a
stale row with its last-computed `frequencyRank` — clear `Lexeme`/`Sense`/
`WordForm`/`ExampleWord` (and any `UserWord` blocking that delete via FK) by
hand first if you need a fully clean rebuild for accurate rank-based
measurement.

Flags: `--in <path>` (default `data/german.jsonl`), `--ranked <path>` (default
`data/ranked.json`), `--language <code>` (default `de`), `--batch-size <n>`
(default 1000).

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
- `isFormOfEntry` / `harvestFormOfForms`: read ONLY the structured `form_of`
  field, never gloss prose — but the field itself isn't always trustworthy.
  kaikki's own extraction can mis-parse a sense's English gloss text into a
  bogus `form_of` entry (real example: "sich"'s first sense produced a
  `form_of` target of literally `"the third person singular or plural"` —
  lifted from its own gloss, not a German word). A target only counts if it's
  BOTH a different word than the entry's own AND a real lemma that exists in
  the dump (`lemma-set.ts`'s `buildLemmaSet`, built from every `entry.word` in
  the filtered kaikki stream) — otherwise the entry imports as a normal lemma
  instead of being silently dropped.

## Example sentence corpus (`4-examples.ts` / `5-index.ts`)

Fills `Example` (a German sentence + its English translation, deduped, flagged
`isWellFormed`) and `ExampleWord` (the reverse index: which lexemes appear in
which sentences, and whether that specific pairing is safe to drill — see
`Sense.example`'s ~25% usable rate, which is why this is a table and not a
column). No AI, no runtime NLP — everything resolves at seed time into stored
flags. Full design rationale lives in the task spec this was built from; the
short version:

```
pnpm --filter @wortgarten/seed run seed:examples --source tatoeba
pnpm --filter @wortgarten/seed run seed:index
pnpm --filter @wortgarten/seed run seed:verify
```

**Windows/pnpm note:** don't add an extra `--` before flags here (unlike the
passes above) — on this pnpm/Windows combination `pnpm run seed:examples --
--source tatoeba` forwards a literal `"--"` token into `argv`, which Node's
`util.parseArgs` treats as an end-of-options marker and silently drops every
flag after it to positionals. `pnpm run seed:examples --source tatoeba`
(no extra `--`) passes flags through correctly.

### `seed:examples` (`src/4-examples.ts`) — ingest

`--source tatoeba` streams `data/deu-eng.tsv` (Tatoeba's German–English
sentence-pairs export, gitignored — download the `deu-eng.tsv` link from
[tatoeba.org/en/downloads](https://tatoeba.org/en/downloads)), groups by
`deu_id`, keeps only the lowest `eng_id` per group (the original direct
translation — later ones are alternate/looser paraphrases), and writes one
`Example` row per distinct German sentence with `isWellFormed` computed from
all five rules: 4–10 tokens, starts capital/ends `.!?`, has a real translation,
not a quotation (Wiktionary-only), and every token resolves to a seeded lexeme
except at most 2 tokens from `src/proper-noun-allowlist.ts`.

Also prints the top 50 tokens (by frequency, across the whole corpus) that
resolve to no seeded lexeme — the data step that built the allowlist. If you
add proper nouns to that file, re-run this pass to pick up the change (content-
hashed ids mean re-running is always a safe no-op for unchanged sentences).

`--source wiktionary` is not implemented yet — gated on reading the coverage
report below first (see the task spec's Build order).

### `seed:index` (`src/5-index.ts`) — resolve and index

For every `isWellFormed` `Example`, resolves the German text one sentence at a
time via `lexicon-index.ts`'s `resolveSentence` — the same
`resolveSeparableSentence` algorithm (`@wortgarten/shared`) `apps/api`'s
`LookupService` uses at runtime, including the clause-final positional guard
and the finite-verb requirement. A German separable verb that splits in the
sentence (`Ich rufe dich an.`) reassembles into ONE slot attributed to the
separable lexeme (`anrufen`) — never to the bare stem's other reading
(`rufen`) and never leaving the prefix (`an`) as an orphaned standalone word.
Deliberately simpler than the runtime service only in that it has no
contraction resolution. A 2-token merged slot writes `prefixPosition` /
`prefixSurface` on its `ExampleWord` row alongside the usual `position`
(anchored to the finite verb's own token) and `surface`.

Sense resolution uses the English translation as the disambiguation signal
(`Ich gehe zur Bank.` is usable for `gehen`, not for the polysemous `Bank` —
same sentence, different `isUsableForTiles` per word). Ambiguity ACROSS
lexemes is fatal; ambiguity WITHIN one lexeme's senses is not: a token
resolving to exactly one lexeme is always `isUsableForTiles = true` regardless
of how many senses it has (`senseId` is a best-effort ranking preference —
sense-exact sentences served first — never a usability gate); a token
resolving to several distinct lexemes (a homograph split into separate
`Lexeme` rows, e.g. "Bank" the bench vs. "Bank" the financial institution)
must disambiguate the LEXEME from the English side — each candidate lexeme's
matched senses are reduced to core terms (parentheticals stripped, split on
`,`/`;`, leading `to ` dropped, light stemming) and tested against the
sentence's English side; exactly one lexeme with a matching sense wins,
anything else leaves the token unusable. Fails safe: a missing sentence is a
gap, a wrong-lexeme sentence is a lie.

Self-healing like `3-load.ts`'s `WordForm` writes: an `ExampleWord` row from a
previous run that this run no longer produces (e.g. the dictionary changed
under it) gets deleted, not left stale.

### `seed:verify` — extended

Also runs the sentence-corpus assertions (the "Ich gehe zur Bank." per-word
flag test, the Bank/Bänke/Banken homograph-split regression against real
indexed sentences, idempotency, the Tatoeba duplicate-collapse case) and
prints the coverage report: ingested/deduped counts, well-formed pass rate, %
of all seeded lexemes and — the number that matters — % of the **top-1,000 by
frequencyRank** with ≥1 tileable example, median tileable examples per lexeme,
and the starved list (zero-coverage lexemes by frequency — the AI worker's
future job queue).

**Verb-coverage fix regression suite** (permanent — each pins a real bug this
fix removed): every one of the top-500 highest-frequency word forms resolves
to a seeded `Lexeme` (would have caught `sich`); `sich` itself exists with
`pos = PRONOUN`; no sentence attached to a base verb is poisoned by a
clause-final sibling separable-verb prefix (the general form of the
`rufen`/`anrufen` bug, scanned across every real base+separable pair in the
seed); `anrufen` has ≥1 tileable example; `rufen` specifically has none
sourced from a clause-final `an`; "Ich denke an dich." (if present in the
corpus) does not falsely merge `denke` + `an`; verb coverage in the top-1,000
is ≥80% (fails the build below that).

## Attribution (required)

Wiktionary data is **CC-BY-SA / GFDL**. The app must credit Wiktionary and note
kaikki.org / wiktextract as the extraction source (settings/about page — not yet
added; do this before shipping the dictionary import). Record the extract date
and the frequency list's license above once chosen.

Example sentences from the **Tatoeba Project** (tatoeba.org), **CC BY 2.0 FR**.
Attribution is per-sentence: `Example.sourceRef` stores `tatoeba:<deu_id>/<eng_id>`
for every Tatoeba-sourced row — required to credit each sentence's contributor,
not just a line in Settings. Unlike the Wiktionary data above, **CC-BY has no
share-alike** — cleaner for a commercial launch than the kaikki-derived
dictionary.

**Share-alike may have implications for redistributing the derived dictionary
data.** This is not legal advice — review it before any commercial launch, don't
let it be a surprise later.
