import { afterEach, describe, expect, it } from 'vitest';
import { resolveImageProvider } from './provider';

const saved = process.env.IMAGE_PROVIDER;

afterEach(() => {
  if (saved === undefined) delete process.env.IMAGE_PROVIDER;
  else process.env.IMAGE_PROVIDER = saved;
});

describe('resolveImageProvider', () => {
  it('defaults to gemini when unset', () => {
    delete process.env.IMAGE_PROVIDER;
    expect(resolveImageProvider()).toBe('gemini');
  });

  it('accepts "cloudflare"', () => {
    process.env.IMAGE_PROVIDER = 'cloudflare';
    expect(resolveImageProvider()).toBe('cloudflare');
  });

  it('is case-insensitive and trims whitespace', () => {
    process.env.IMAGE_PROVIDER = '  Cloudflare  ';
    expect(resolveImageProvider()).toBe('cloudflare');
  });

  it('throws on an unknown value', () => {
    process.env.IMAGE_PROVIDER = 'dalle';
    expect(() => resolveImageProvider()).toThrow(/Unknown IMAGE_PROVIDER/);
  });
});
