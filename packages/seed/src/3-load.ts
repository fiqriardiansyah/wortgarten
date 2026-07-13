import './env';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { parseArgs } from 'util';
import { Prisma, PrismaClient, type Gender, type PartOfSpeech } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import { KaikkiEntrySchema, RankedFileSchema } from './types';
import {
  contentId,
  extractAuxiliary,
  extractGender,
  extractGovernment,
  extractPastParticiple,
  extractPlural,
  extractSeparablePrefix,
  harvestFormOfForms,
  isFormOfEntry,
  lexemeCoreKey,
  lexemeSourceKey,
  mapForms,
  mapPos,
  mapSenses,
  senseSourceKey,
  type LexemeIdentity,
  type MappedForm,
  type MappedSense,
} from './map';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_IN = path.join(DATA_DIR, 'german.jsonl');
const DEFAULT_RANKED = path.join(DATA_DIR, 'ranked.json');

interface LexemeBuilder {
  id: string;
  sourceKey: string;
  identity: LexemeIdentity;
  rank: number;
  etymologyNumber: number | null;
  government?: string;
  senses: MappedSense[];
  senseGlossCounts: Map<string, number>; // normalized gloss -> occurrences seen, for sourceKey disambiguation
  forms: Map<string, MappedForm>; // deduped on `${surface}|${JSON(features)}`
}

function addForm(builder: LexemeBuilder, form: MappedForm) {
  const key = `${form.surface}|${JSON.stringify(form.features)}`;
  if (!builder.forms.has(key)) builder.forms.set(key, form);
}

function addSense(builder: LexemeBuilder, sense: MappedSense) {
  if (builder.senses.length >= 5) return;
  builder.senses.push(sense);
}

async function main() {
  const { values } = parseArgs({
    allowPositionals: true, // pnpm on Windows can forward a stray literal "--" token
    options: {
      in: { type: 'string', default: DEFAULT_IN },
      ranked: { type: 'string', default: DEFAULT_RANKED },
      language: { type: 'string', default: 'de' },
      'batch-size': { type: 'string', default: '1000' },
    },
  });

  const inPath = values.in as string;
  const rankedPath = values.ranked as string;
  const language = values.language as string;
  const batchSize = Number(values['batch-size']);

  if (!fs.existsSync(inPath)) {
    console.error(`[load] input not found: ${inPath} — run seed:filter first`);
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(rankedPath)) {
    console.error(`[load] ranked file not found: ${rankedPath} — run seed:rank first`);
    process.exitCode = 1;
    return;
  }

  const rankedFile = RankedFileSchema.parse(JSON.parse(fs.readFileSync(rankedPath, 'utf-8')));

  const builders = new Map<string, LexemeBuilder>();
  const byLemmaText = new Map<string, { identity: LexemeIdentity; builder: LexemeBuilder }[]>();
  for (const r of rankedFile.entries) {
    const identity: LexemeIdentity = {
      lemma: r.lemma,
      pos: r.pos as PartOfSpeech,
      gender: r.gender,
      plural: r.plural,
      separablePrefix: r.separablePrefix,
      auxiliary: r.auxiliary,
      pastParticiple: r.pastParticiple,
    };
    const sourceKey = lexemeSourceKey(language, identity);
    const builder: LexemeBuilder = {
      id: contentId(sourceKey),
      sourceKey,
      identity,
      rank: r.rank,
      etymologyNumber: r.etymologyNumber,
      senses: [],
      senseGlossCounts: new Map(),
      forms: new Map(),
    };
    builders.set(lexemeCoreKey(identity), builder);
    const list = byLemmaText.get(r.lemma) ?? [];
    list.push({ identity, builder });
    byLemmaText.set(r.lemma, list);
  }

  const prisma = new PrismaClient();

  let read = 0;
  let malformed = 0;
  let matchedLemmaEntries = 0;
  let formOfHarvested = 0;
  let formOfUnmatched = 0;
  let formOfAmbiguousSkipped = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(inPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    read++;

    const result = KaikkiEntrySchema.safeParse(JSON.parse(line));
    if (!result.success) {
      malformed++;
      continue;
    }
    const entry = result.data;

    if (isFormOfEntry(entry)) {
      const entryPos = mapPos(entry.pos);
      const entryGender = extractGender(entry, entryPos);

      for (const harvest of harvestFormOfForms(entry)) {
        const candidates = (byLemmaText.get(harvest.targetLemma) ?? []).filter((c) => c.identity.pos === entryPos);
        // A diminutive's own gender is always neuter regardless of its base
        // noun's gender — never valid evidence for which target it belongs to.
        const genderMatches = entryGender && !harvest.isDiminutive ? candidates.filter((c) => c.identity.gender === entryGender) : candidates;
        const targets = genderMatches.length > 0 ? genderMatches : candidates;

        if (targets.length === 0) {
          formOfUnmatched++;
          continue;
        }
        // A form_of stub entry only carries the target's lemma text (+ pos/gender
        // when available) — never enough to disambiguate a real homograph (e.g.
        // two nouns sharing lemma+pos+gender but differing in plural). Broadcasting
        // to every candidate would silently reintroduce the exact cross-attachment
        // bug this fix exists to remove, so an unresolved ambiguity is skipped, not guessed.
        if (targets.length > 1) {
          formOfAmbiguousSkipped++;
          continue;
        }
        addForm(targets[0].builder, {
          surface: harvest.surface,
          normalized: foldForLookup(harvest.surface),
          features: harvest.features,
        });
        formOfHarvested++;
      }
      continue;
    }

    const pos = mapPos(entry.pos);
    const gender = extractGender(entry, pos) ?? null;
    const plural = extractPlural(entry, pos) ?? null;
    const separablePrefix = extractSeparablePrefix(entry, pos) ?? null;
    const auxiliary = extractAuxiliary(entry, pos) ?? null;
    const pastParticiple = extractPastParticiple(entry, pos) ?? null;
    const identity: LexemeIdentity = { lemma: entry.word, pos, gender, plural, separablePrefix, auxiliary, pastParticiple };
    const builder = builders.get(lexemeCoreKey(identity));
    if (!builder) continue;

    matchedLemmaEntries++;
    if (builder.government === undefined) builder.government = extractGovernment(entry, pos);

    for (const sense of mapSenses(entry)) addSense(builder, sense);
    for (const form of mapForms(entry, separablePrefix ?? undefined)) addForm(builder, form);
  }

  console.log(`[load] stream pass: ${read.toLocaleString()} lines, ${malformed.toLocaleString()} malformed skipped`);
  console.log(`[load] ${matchedLemmaEntries.toLocaleString()} raw entries matched a ranked lemma`);
  console.log(
    `[load] form_of: ${formOfHarvested.toLocaleString()} forms harvested, ${formOfUnmatched.toLocaleString()} unmatched, ${formOfAmbiguousSkipped.toLocaleString()} skipped (ambiguous homograph target)`,
  );

  const all = [...builders.values()];
  const withNoForms = all.filter((b) => b.forms.size === 0);
  if (withNoForms.length > 0) {
    console.warn(`[load] WARNING: ${withNoForms.length} ranked lemma(s) matched zero raw entries (data gap):`);
    for (const b of withNoForms.slice(0, 20)) console.warn(`    ${b.identity.lemma} (${b.identity.pos}${b.identity.gender ? ', ' + b.identity.gender : ''})`);
  }

  let lexemesCreated = 0;
  let lexemesUpdated = 0;
  let lexemesUnchanged = 0;
  let sensesCreated = 0;
  let sensesUpdated = 0;
  let sensesUnchanged = 0;
  let formsLexemesChanged = 0;
  let formsLexemesUnchanged = 0;
  let formsRowsWritten = 0;

  for (let i = 0; i < all.length; i += batchSize) {
    const chunk = all.slice(i, i + batchSize);
    const chunkIds = chunk.map((b) => b.id);

    const existingLexemes = await prisma.lexeme.findMany({ where: { id: { in: chunkIds } } });
    const existingLexemeById = new Map(existingLexemes.map((l) => [l.id, l]));

    const existingSenses = await prisma.sense.findMany({ where: { lexemeId: { in: chunkIds } } });
    const existingSenseById = new Map(existingSenses.map((s) => [s.id, s]));

    // Grouped by lexeme so a changed extraction (e.g. this run's diminutive-
    // gender fix) can be detected and self-heal — WordForm has no FK
    // dependents (unlike Sense/Lexeme, nothing points at a WordForm.id), so
    // unlike those two, a stale/wrong row here is pure liability, never worth
    // preserving. Diffed by id set, not blind skipDuplicates, so this still
    // writes nothing when a lexeme's forms genuinely haven't changed.
    const existingForms = await prisma.wordForm.findMany({ where: { lexemeId: { in: chunkIds } }, select: { id: true, lexemeId: true } });
    const existingFormIdsByLexeme = new Map<string, Set<string>>();
    for (const f of existingForms) {
      const set = existingFormIdsByLexeme.get(f.lexemeId) ?? new Set<string>();
      set.add(f.id);
      existingFormIdsByLexeme.set(f.lexemeId, set);
    }

    await prisma.$transaction(
      async (tx) => {
        for (const b of chunk) {
          const data = {
            sourceKey: b.sourceKey,
            language,
            lemma: b.identity.lemma,
            partOfSpeech: b.identity.pos,
            gender: b.identity.gender ?? null,
            plural: b.identity.plural ?? null,
            separablePrefix: b.identity.separablePrefix ?? null,
            auxiliary: b.identity.auxiliary ?? null,
            government: b.government ?? null,
            etymologyNumber: b.etymologyNumber,
            frequencyRank: b.rank,
            provenance: 'SEED' as const,
            isVerified: true,
          };
          const existing = existingLexemeById.get(b.id);
          if (!existing) lexemesCreated++;
          else if (lexemeChanged(existing, data)) lexemesUpdated++;
          else lexemesUnchanged++;

          await tx.lexeme.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data });

          for (const s of b.senses) {
            const occurrence = b.senseGlossCounts.get(s.translation) ?? 0;
            b.senseGlossCounts.set(s.translation, occurrence + 1);
            const sSourceKey = senseSourceKey(b.id, s.translation, occurrence);
            const sId = contentId(sSourceKey);
            const sData = { translation: s.translation, example: s.example ?? null };
            const existingSense = existingSenseById.get(sId);
            if (!existingSense) sensesCreated++;
            else if (existingSense.translation !== sData.translation || existingSense.example !== sData.example) sensesUpdated++;
            else sensesUnchanged++;

            await tx.sense.upsert({
              where: { id: sId },
              create: { id: sId, sourceKey: sSourceKey, lexemeId: b.id, ...sData },
              update: sData,
            });
          }

          const formRows = [...b.forms.values()].map((f) => ({
            id: contentId(`${b.id}|${f.surface}|${JSON.stringify(f.features)}`),
            lexemeId: b.id,
            surface: f.surface,
            normalized: f.normalized,
            features: f.features as Prisma.InputJsonValue,
          }));
          const freshFormIds = new Set(formRows.map((r) => r.id));
          const existingFormIds = existingFormIdsByLexeme.get(b.id) ?? new Set<string>();
          const formsUnchanged = freshFormIds.size === existingFormIds.size && [...freshFormIds].every((id) => existingFormIds.has(id));

          if (formsUnchanged) {
            formsLexemesUnchanged++;
          } else {
            formsLexemesChanged++;
            await tx.wordForm.deleteMany({ where: { lexemeId: b.id } });
            if (formRows.length > 0) await tx.wordForm.createMany({ data: formRows });
            formsRowsWritten += formRows.length;
          }
        }
      },
      { timeout: 120_000 }, // a batch can carry tens of thousands of WordForm rows (full conjugation tables) — default 5s Prisma timeout is a web-request default, not right for an offline bulk import
    );

    console.log(`[load] batch ${Math.floor(i / batchSize) + 1}: ${Math.min(i + batchSize, all.length)}/${all.length} lexemes processed so far`);
  }

  // Sense ids are keyed on gloss text (see senseSourceKey) — if Wiktionary edits
  // a gloss between reseeds, that sense gets a new id and any UserWord pointing
  // at the old one is now orphaned. Report it; never delete a UserWord over this.
  const allSenseIds = await prisma.sense.findMany({ select: { id: true } });
  const senseIdSet = new Set(allSenseIds.map((s) => s.id));
  const allUserWords = await prisma.userWord.findMany({ select: { id: true, userId: true, senseId: true } });
  const orphanedUserWords = allUserWords.filter((uw) => !senseIdSet.has(uw.senseId));

  const nouns = all.filter((b) => b.identity.pos === 'NOUN');
  const nounsMissingGender = nouns.filter((b) => b.identity.gender == null).length;
  const nounsMissingPlural = nouns.filter((b) => !b.identity.plural).length;
  const verbs = all.filter((b) => b.identity.pos === 'VERB');
  const verbsWithSeparablePrefix = verbs.filter((b) => b.identity.separablePrefix).length;
  const verbsMissingAuxiliary = verbs.filter((b) => !b.identity.auxiliary).length;

  console.log('\n[load] ── report ──────────────────────────────────────────');
  console.log(`  lexemes total:             ${all.length.toLocaleString()}`);
  console.log(`  lexemes created:           ${lexemesCreated.toLocaleString()}`);
  console.log(`  lexemes updated:           ${lexemesUpdated.toLocaleString()}`);
  console.log(`  lexemes unchanged:         ${lexemesUnchanged.toLocaleString()}`);
  console.log(`  senses created:            ${sensesCreated.toLocaleString()}`);
  console.log(`  senses updated:            ${sensesUpdated.toLocaleString()}`);
  console.log(`  senses unchanged:          ${sensesUnchanged.toLocaleString()}`);
  console.log(`  lexemes w/ forms changed:  ${formsLexemesChanged.toLocaleString()}`);
  console.log(`  lexemes w/ forms unchanged: ${formsLexemesUnchanged.toLocaleString()}`);
  console.log(`  form rows written:         ${formsRowsWritten.toLocaleString()}`);
  console.log(`  nouns missing gender:      ${nounsMissingGender}/${nouns.length}`);
  console.log(`  nouns missing plural:      ${nounsMissingPlural}/${nouns.length}`);
  console.log(`  verbs with separablePrefix: ${verbsWithSeparablePrefix}/${verbs.length}`);
  console.log(`  verbs missing auxiliary:   ${verbsMissingAuxiliary}/${verbs.length}`);
  console.log(`  ranked lemmas w/ no forms: ${withNoForms.length}`);
  console.log(`  orphaned UserWord rows:    ${orphanedUserWords.length}`);
  if (orphanedUserWords.length > 0) {
    for (const uw of orphanedUserWords.slice(0, 20)) console.log(`    UserWord ${uw.id} (user ${uw.userId}) → missing sense ${uw.senseId}`);
  }
  console.log('────────────────────────────────────────────────────────────');

  await prisma.$disconnect();
}

function lexemeChanged(
  existing: {
    sourceKey: string;
    lemma: string;
    partOfSpeech: string;
    gender: Gender | null;
    plural: string | null;
    separablePrefix: string | null;
    auxiliary: string | null;
    government: string | null;
    etymologyNumber: number | null;
    frequencyRank: number | null;
  },
  next: {
    sourceKey: string;
    lemma: string;
    partOfSpeech: string;
    gender: Gender | null;
    plural: string | null;
    separablePrefix: string | null;
    auxiliary: string | null;
    government: string | null;
    etymologyNumber: number | null;
    frequencyRank: number;
  },
): boolean {
  return (
    existing.sourceKey !== next.sourceKey ||
    existing.lemma !== next.lemma ||
    existing.partOfSpeech !== next.partOfSpeech ||
    existing.gender !== next.gender ||
    existing.plural !== next.plural ||
    existing.separablePrefix !== next.separablePrefix ||
    existing.auxiliary !== next.auxiliary ||
    existing.government !== next.government ||
    existing.etymologyNumber !== next.etymologyNumber ||
    existing.frequencyRank !== next.frequencyRank
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
