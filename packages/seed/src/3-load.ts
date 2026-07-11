import './env';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { parseArgs } from 'util';
import { Prisma, PrismaClient, type Gender, type PartOfSpeech } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import { KaikkiEntrySchema, RankedFileSchema, type RankedLemma } from './types';
import {
  compositeKey,
  extractAuxiliary,
  extractGender,
  extractGovernment,
  extractPlural,
  extractSeparablePrefix,
  harvestFormOfForms,
  isFormOfEntry,
  mapForms,
  mapPos,
  mapSenses,
  type MappedForm,
  type MappedSense,
} from './map';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_IN = path.join(DATA_DIR, 'german.jsonl');
const DEFAULT_RANKED = path.join(DATA_DIR, 'ranked.json');

interface LexemeBuilder {
  id: string;
  lemma: string;
  pos: PartOfSpeech;
  gender: Gender | null;
  rank: number;
  plural?: string;
  separablePrefix?: string;
  auxiliary?: string;
  government?: string;
  senses: MappedSense[];
  forms: Map<string, MappedForm>; // deduped on `${surface}|${JSON(features)}`
}

function addForm(builder: LexemeBuilder, form: MappedForm) {
  const key = `${form.surface}|${JSON.stringify(form.features)}`;
  if (!builder.forms.has(key)) builder.forms.set(key, form);
}

async function main() {
  const { values } = parseArgs({
    allowPositionals: true, // pnpm on Windows can forward a stray literal "--" token
    options: {
      in: { type: 'string', default: DEFAULT_IN },
      ranked: { type: 'string', default: DEFAULT_RANKED },
      language: { type: 'string', default: 'de' },
      truncate: { type: 'boolean', default: false },
      'batch-size': { type: 'string', default: '1000' },
    },
  });

  const inPath = values.in as string;
  const rankedPath = values.ranked as string;
  const language = values.language as string;
  const truncate = values.truncate as boolean;
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
  const byLemmaText = new Map<string, RankedLemma[]>();
  for (const r of rankedFile.entries) {
    const key = compositeKey(r.lemma, r.pos as PartOfSpeech, r.gender);
    builders.set(key, {
      id: crypto.randomUUID(),
      lemma: r.lemma,
      pos: r.pos as PartOfSpeech,
      gender: r.gender,
      rank: r.rank,
      senses: [],
      forms: new Map(),
    });
    const list = byLemmaText.get(r.lemma) ?? [];
    list.push(r);
    byLemmaText.set(r.lemma, list);
  }

  const prisma = new PrismaClient();

  if (truncate) {
    console.log(`[load] --truncate: clearing existing '${language}' dictionary rows (Lexeme cascades to Sense/WordForm)`);
    await prisma.lexeme.deleteMany({ where: { language } });
  }

  let read = 0;
  let malformed = 0;
  let matchedLemmaEntries = 0;
  let formOfHarvested = 0;
  let formOfUnmatched = 0;

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
        const posMatches = (byLemmaText.get(harvest.targetLemma) ?? []).filter((r) => r.pos === entryPos);
        const genderMatches = entryGender ? posMatches.filter((r) => r.gender === entryGender) : [];
        const targets = genderMatches.length > 0 ? genderMatches : posMatches;

        if (targets.length === 0) {
          formOfUnmatched++;
          continue;
        }
        for (const target of targets) {
          const builder = builders.get(compositeKey(target.lemma, target.pos as PartOfSpeech, target.gender));
          if (!builder) continue;
          addForm(builder, {
            surface: harvest.surface,
            normalized: foldForLookup(harvest.surface),
            features: harvest.features,
          });
          formOfHarvested++;
        }
      }
      continue;
    }

    const pos = mapPos(entry.pos);
    const gender = extractGender(entry, pos) ?? null;
    const builder = builders.get(compositeKey(entry.word, pos, gender));
    if (!builder) continue;

    matchedLemmaEntries++;
    if (builder.plural === undefined) builder.plural = extractPlural(entry, pos);
    if (builder.separablePrefix === undefined) builder.separablePrefix = extractSeparablePrefix(entry, pos);
    if (builder.auxiliary === undefined) builder.auxiliary = extractAuxiliary(entry, pos);
    if (builder.government === undefined) builder.government = extractGovernment(entry, pos);

    for (const sense of mapSenses(entry)) {
      if (builder.senses.length >= 5) break;
      builder.senses.push(sense);
    }
    for (const form of mapForms(entry, builder.separablePrefix)) addForm(builder, form);
  }

  console.log(`[load] stream pass: ${read.toLocaleString()} lines, ${malformed.toLocaleString()} malformed skipped`);
  console.log(`[load] ${matchedLemmaEntries.toLocaleString()} raw entries matched a ranked lemma`);
  console.log(`[load] form_of: ${formOfHarvested.toLocaleString()} forms harvested, ${formOfUnmatched.toLocaleString()} unmatched`);

  const all = [...builders.values()];
  const withNoForms = all.filter((b) => b.forms.size === 0);
  if (withNoForms.length > 0) {
    console.warn(`[load] WARNING: ${withNoForms.length} ranked lemma(s) matched zero raw entries (data gap):`);
    for (const b of withNoForms.slice(0, 20)) console.warn(`    ${b.lemma} (${b.pos}${b.gender ? ', ' + b.gender : ''})`);
  }

  // Postgres unique constraints treat NULL as distinct from NULL, so
  // `skipDuplicates` against [language, lemma, partOfSpeech, gender] would
  // silently re-insert every non-noun (gender is always null there) on a
  // second run. Check existence explicitly instead of trusting the DB
  // constraint to dedupe rows whose gender is null.
  const existingRows = await prisma.lexeme.findMany({
    where: { language },
    select: { lemma: true, partOfSpeech: true, gender: true },
  });
  const existingKeys = new Set(existingRows.map((r) => compositeKey(r.lemma, r.partOfSpeech, r.gender)));
  const toInsert = all.filter((b) => !existingKeys.has(compositeKey(b.lemma, b.pos, b.gender)));

  let lexemesInserted = 0;
  const lexemesSkippedExisting = all.length - toInsert.length;
  let sensesInserted = 0;
  let formsInserted = 0;

  for (let i = 0; i < toInsert.length; i += batchSize) {
    const chunk = toInsert.slice(i, i + batchSize);

    await prisma.$transaction(async (tx) => {
      const lexemeRows = chunk.map((b) => ({
        id: b.id,
        language,
        lemma: b.lemma,
        partOfSpeech: b.pos,
        gender: b.gender,
        plural: b.plural ?? null,
        separablePrefix: b.separablePrefix ?? null,
        auxiliary: b.auxiliary ?? null,
        government: b.government ?? null,
        frequencyRank: b.rank,
        provenance: 'SEED' as const,
        isVerified: true,
      }));

      await tx.lexeme.createMany({ data: lexemeRows });

      const senseRows: { id: string; lexemeId: string; translation: string; example: string | null }[] = [];
      const formRows: { id: string; lexemeId: string; surface: string; normalized: string; features: Prisma.InputJsonValue }[] = [];

      for (const b of chunk) {
        for (const s of b.senses) {
          senseRows.push({ id: crypto.randomUUID(), lexemeId: b.id, translation: s.translation, example: s.example ?? null });
        }
        for (const f of b.forms.values()) {
          formRows.push({
            id: crypto.randomUUID(),
            lexemeId: b.id,
            surface: f.surface,
            normalized: f.normalized,
            features: f.features as Prisma.InputJsonValue,
          });
        }
      }

      if (senseRows.length > 0) await tx.sense.createMany({ data: senseRows });
      if (formRows.length > 0) await tx.wordForm.createMany({ data: formRows });

      lexemesInserted += chunk.length;
      sensesInserted += senseRows.length;
      formsInserted += formRows.length;
    }, { timeout: 60_000 }); // a batch can carry tens of thousands of WordForm rows (full conjugation tables) — default 5s Prisma timeout is a web-request default, not right for an offline bulk import

    console.log(`[load] batch ${Math.floor(i / batchSize) + 1}: ${lexemesInserted}/${toInsert.length} lexemes inserted so far`);
  }

  const nouns = all.filter((b) => b.pos === 'NOUN');
  const nounsMissingGender = nouns.filter((b) => b.gender == null).length;
  const nounsMissingPlural = nouns.filter((b) => !b.plural).length;
  const verbs = all.filter((b) => b.pos === 'VERB');
  const verbsWithSeparablePrefix = verbs.filter((b) => b.separablePrefix).length;
  const verbsMissingAuxiliary = verbs.filter((b) => !b.auxiliary).length;

  console.log('\n[load] ── report ──────────────────────────────────────────');
  console.log(`  lexemes attempted:        ${all.length.toLocaleString()}`);
  console.log(`  lexemes inserted:         ${lexemesInserted.toLocaleString()}`);
  console.log(`  lexemes already present:  ${lexemesSkippedExisting.toLocaleString()} (skipped, no dupes)`);
  console.log(`  senses inserted:          ${sensesInserted.toLocaleString()}`);
  console.log(`  forms inserted:           ${formsInserted.toLocaleString()}`);
  console.log(`  nouns missing gender:     ${nounsMissingGender}/${nouns.length}`);
  console.log(`  nouns missing plural:     ${nounsMissingPlural}/${nouns.length}`);
  console.log(`  verbs with separablePrefix: ${verbsWithSeparablePrefix}/${verbs.length}`);
  console.log(`  verbs missing auxiliary:  ${verbsMissingAuxiliary}/${verbs.length}`);
  console.log(`  ranked lemmas w/ no forms: ${withNoForms.length}`);
  console.log('────────────────────────────────────────────────────────────');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
