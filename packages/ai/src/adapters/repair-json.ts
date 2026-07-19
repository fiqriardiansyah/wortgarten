/** Strips markdown code fences (```json … ```) and any prose surrounding the JSON object. */
function stripCodeFences(text: string): string {
  return text.replace(/```(?:json)?/gi, '').trim();
}

/** Keeps only the outermost {...} span — drops any prose the model added before/after it. */
function extractOutermostObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

/**
 * Single scan over the text, tracking whether we're inside a JSON string, fixing the two most
 * common small-model mistakes as it goes:
 *  - a raw (unescaped) newline/carriage-return inside a string value — the model wrote a real
 *    line break instead of the two-character `\n` escape.
 *  - an unescaped `"` inside a string value (leaked dialogue quotes, mostly) — detected by
 *    peeking past the quote: a quote immediately followed by a JSON structural character
 *    (`,` `:` `}` `]`, or end of text) genuinely closes the string; anything else is treated as a
 *    literal quote inside the string and escaped instead.
 */
function scanAndFix(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      out += '\\n';
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      const next = text[j];
      const closesString = next === undefined || ',:}]'.includes(next);
      if (closesString) {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }

    out += ch;
  }

  return out;
}

/** Drops a trailing comma immediately before a closing `}` or `]`. */
function removeTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Best-effort repair of near-valid JSON from a small model, tried before a draft is declared
 * `BAD_JSON`. Pure function — no guarantee the result parses, just a better shot at it. Order
 * matters: fences/prose must come off before the outermost-object scan, and the string-aware
 * quote/newline fix must run before the (string-unaware) trailing-comma strip.
 */
export function repairJson(text: string): string {
  let result = stripCodeFences(text);
  result = extractOutermostObject(result);
  result = scanAndFix(result);
  result = removeTrailingCommas(result);
  return result;
}
