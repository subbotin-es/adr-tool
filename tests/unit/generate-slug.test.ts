import { describe, it, expect } from 'vitest';
import { generateSlug } from '../../src/utils/generate-slug';

describe('generateSlug — basic conversion', () => {
  it('lowercases the title', () => {
    expect(generateSlug('Use Cloudflare Workers')).toBe('use-cloudflare-workers');
  });

  it('converts spaces to hyphens', () => {
    expect(generateSlug('hello world')).toBe('hello-world');
  });

  it('converts underscores to hyphens', () => {
    expect(generateSlug('hello_world')).toBe('hello-world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(generateSlug('  hello world  ')).toBe('hello-world');
  });
});

describe('generateSlug — special characters', () => {
  it('removes punctuation', () => {
    expect(generateSlug('Hello, World!')).toBe('hello-world');
  });

  it('removes parentheses', () => {
    expect(generateSlug('Use D1 (SQLite) for Storage')).toBe('use-d1-sqlite-for-storage');
  });

  it('removes dots and colons', () => {
    expect(generateSlug('ADR: Use v2.0 API')).toBe('adr-use-v20-api');
  });

  it('collapses multiple consecutive hyphens', () => {
    expect(generateSlug('hello---world')).toBe('hello-world');
  });

  it('removes leading hyphens', () => {
    expect(generateSlug('-leading-hyphen')).toBe('leading-hyphen');
  });

  it('removes trailing hyphens', () => {
    expect(generateSlug('trailing-hyphen-')).toBe('trailing-hyphen');
  });

  it('handles ampersand', () => {
    expect(generateSlug('pros & cons')).toBe('pros-cons');
  });
});

describe('generateSlug — length enforcement', () => {
  it('truncates slugs longer than 100 characters', () => {
    const longTitle = 'a'.repeat(150);
    expect(generateSlug(longTitle)).toHaveLength(100);
  });

  it('preserves slugs exactly at 100 characters', () => {
    const title = 'a'.repeat(100);
    expect(generateSlug(title)).toHaveLength(100);
  });
});

describe('generateSlug — edge cases', () => {
  it('returns empty string for all-special-char input', () => {
    expect(generateSlug('!@#$%^&*()')).toBe('');
  });

  it('handles single word', () => {
    expect(generateSlug('cloudflare')).toBe('cloudflare');
  });

  it('handles numbers in title', () => {
    expect(generateSlug('Use ADR 2024 Format')).toBe('use-adr-2024-format');
  });
});
