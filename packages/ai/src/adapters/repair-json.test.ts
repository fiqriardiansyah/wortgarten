import { describe, expect, it } from 'vitest';
import { repairJson } from './repair-json';

describe('repairJson', () => {
  it('strips markdown code fences around an otherwise-valid object', () => {
    const raw = '```json\n{"title": "Hund", "story": "Der Hund läuft.", "translation": "The dog runs."}\n```';
    const parsed = JSON.parse(repairJson(raw));
    expect(parsed).toEqual({ title: 'Hund', story: 'Der Hund läuft.', translation: 'The dog runs.' });
  });

  it('strips prose before and after the JSON object', () => {
    const raw = 'Here is the story:\n{"title": "Hund", "story": "Der Hund läuft."}\nHope that helps!';
    const parsed = JSON.parse(repairJson(raw));
    expect(parsed).toEqual({ title: 'Hund', story: 'Der Hund läuft.' });
  });

  it('drops a trailing comma before a closing brace', () => {
    const raw = '{"title": "Hund", "story": "Der Hund läuft.",}';
    const parsed = JSON.parse(repairJson(raw));
    expect(parsed).toEqual({ title: 'Hund', story: 'Der Hund läuft.' });
  });

  it('drops a trailing comma before a closing bracket', () => {
    const raw = '{"words": ["Hund", "Katze",]}';
    const parsed = JSON.parse(repairJson(raw));
    expect(parsed).toEqual({ words: ['Hund', 'Katze'] });
  });

  it('escapes a raw newline the model wrote inside a string value', () => {
    const raw = '{"title": "Hund", "story": "Der Hund läuft.\nEr ist schnell."}';
    expect(() => JSON.parse(raw)).toThrow();
    const parsed = JSON.parse(repairJson(raw));
    expect(parsed).toEqual({ title: 'Hund', story: 'Der Hund läuft.\nEr ist schnell.' });
  });

  it('escapes an unescaped inner quote from leaked dialogue', () => {
    const raw = '{"title": "Hund", "story": "Anna sagt: "Hallo". Der Hund läuft.", "translation": "Anna says hello."}';
    expect(() => JSON.parse(raw)).toThrow();
    const parsed = JSON.parse(repairJson(raw)) as { title: string; story: string };
    expect(parsed.title).toBe('Hund');
    expect(parsed.story).toBe('Anna sagt: "Hallo". Der Hund läuft.');
  });

  it('handles fences, a trailing comma, and a raw newline together', () => {
    const raw = '```json\n{"title": "Hund",\n"story": "Der Hund läuft.\nEr ist schnell.",\n}\n```';
    const parsed = JSON.parse(repairJson(raw));
    expect(parsed).toEqual({ title: 'Hund', story: 'Der Hund läuft.\nEr ist schnell.' });
  });

  it('leaves already-valid JSON parseable', () => {
    const raw = '{"title": "Hund", "story": "Der Hund läuft."}';
    const parsed = JSON.parse(repairJson(raw));
    expect(parsed).toEqual({ title: 'Hund', story: 'Der Hund läuft.' });
  });
});
