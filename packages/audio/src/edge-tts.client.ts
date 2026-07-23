import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// edge-tts is an UNOFFICIAL client of Microsoft Edge's read-aloud service — it can break if the
// upstream changes, and its terms of use for a commercial product are unclear. Free and excellent
// for building/testing now; verify licensing before a paid launch. Keep this file as the one
// swappable door — nothing outside `packages/audio` talks to edge-tts directly.
const SYNTHESIZE_SCRIPT = join(__dirname, '..', 'scripts', 'synthesize.py');
const TIMEOUT_MS = 30_000;

export interface EdgeTtsWordBoundary {
  text: string;
  offsetMs: number;
  durationMs: number;
}

export interface EdgeTtsResult {
  audioBytes: Buffer;
  words: EdgeTtsWordBoundary[];
}

/** Spawns the Python `edge_tts` helper for one story's spoken text. Throws on any failure or on
 * the hard 30s timeout — callers (see `audio.service.ts`) convert that into a safe `{ok:false}`,
 * same discipline as the image pipeline's Gemini/Cloudflare clients. */
export async function synthesizeGerman(text: string, voice: string, rate: string): Promise<EdgeTtsResult> {
  const dir = await mkdtemp(join(tmpdir(), `wortgarten-audio-${randomUUID()}-`));
  const textFile = join(dir, 'text.txt');
  const audioFile = join(dir, 'out.mp3');
  const timingsFile = join(dir, 'out.json');

  try {
    await writeFile(textFile, text, 'utf-8');

    const pythonBin = process.env.EDGE_TTS_PYTHON_BIN || 'python';
    const args = [
      SYNTHESIZE_SCRIPT,
      '--text-file',
      textFile,
      '--voice',
      voice,
      // `=`-joined, not a separate argv token: a value like "-10%" starts with "-" but isn't a
      // plain negative number, so Python's argparse refuses to treat it as this flag's value
      // otherwise (misreads it as an unrecognized option and reports "--rate: expected one
      // argument") — found via live-verify against the real synthesize.py subprocess.
      `--rate=${rate}`,
      '--out-audio',
      audioFile,
      '--out-timings',
      timingsFile,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(pythonBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, TIMEOUT_MS);

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`edge-tts synthesis timed out after ${TIMEOUT_MS}ms`));
        } else if (code !== 0) {
          reject(new Error(`edge-tts synthesis exited with code ${code}: ${stderr.trim()}`));
        } else {
          resolve();
        }
      });
    });

    const [audioBytes, timingsRaw] = await Promise.all([readFile(audioFile), readFile(timingsFile, 'utf-8')]);
    const timings = JSON.parse(timingsRaw) as { words: EdgeTtsWordBoundary[] };

    if (audioBytes.length === 0) {
      throw new Error('edge-tts produced an empty audio file');
    }

    return { audioBytes, words: timings.words };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
