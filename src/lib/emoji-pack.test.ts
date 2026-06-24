import { describe, expect, it } from 'vitest';
import {
  EMOJI_PACK_DTAG_PREFIX,
  SHORTCODE_RE,
  buildDraftRows,
  buildPackPublishInput,
  generatePackIdentifier,
  isUploadedUrl,
  isValidShortcode,
} from './emoji-pack';

describe('generatePackIdentifier', () => {
  it('prefixes a uuid with emoji-pack-', () => {
    const id = generatePackIdentifier(() => '11111111-2222-4333-8444-555555555555');
    expect(id).toBe('emoji-pack-11111111-2222-4333-8444-555555555555');
    expect(id.startsWith(EMOJI_PACK_DTAG_PREFIX)).toBe(true);
  });

  it('produces an identifier that passes the NIP-30 d-tag validator', () => {
    // crypto.randomUUID() yields lowercase hex + hyphens, all within ^[A-Za-z0-9_-]+$.
    for (let i = 0; i < 20; i += 1) {
      const id = generatePackIdentifier();
      expect(SHORTCODE_RE.test(id)).toBe(true);
    }
  });

  it('is unique across calls (collision-free packs)', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generatePackIdentifier()));
    expect(ids.size).toBe(100);
  });
});

describe('isValidShortcode', () => {
  it('accepts alphanumeric, underscore, and hyphen', () => {
    expect(isValidShortcode('party_blob')).toBe(true);
    expect(isValidShortcode('Blob-2')).toBe(true);
  });

  it('rejects spaces, colons, and emoji', () => {
    expect(isValidShortcode('party blob')).toBe(false);
    expect(isValidShortcode(':blob:')).toBe(false);
    expect(isValidShortcode('🙂')).toBe(false);
    expect(isValidShortcode('')).toBe(false);
  });
});

describe('isUploadedUrl', () => {
  it('accepts https blob urls and rejects http / non-urls', () => {
    expect(isUploadedUrl('https://blossom.example/abc123')).toBe(true);
    expect(isUploadedUrl('http://blossom.example/abc123')).toBe(false);
    expect(isUploadedUrl('not a url')).toBe(false);
  });
});

describe('buildDraftRows', () => {
  it('maps staged entries to draft rows', () => {
    const rows = buildDraftRows([
      { shortcode: 'wave', url: 'https://b.example/1' },
      { shortcode: 'fire', url: 'https://b.example/2' },
    ]);
    expect(rows).toEqual([
      { shortcode: 'wave', url: 'https://b.example/1' },
      { shortcode: 'fire', url: 'https://b.example/2' },
    ]);
  });

  it('drops invalid shortcodes, non-https urls, and duplicate shortcodes', () => {
    const rows = buildDraftRows([
      { shortcode: 'ok', url: 'https://b.example/1' },
      { shortcode: 'bad code', url: 'https://b.example/2' },
      { shortcode: 'insecure', url: 'http://b.example/3' },
      { shortcode: 'ok', url: 'https://b.example/4' },
    ]);
    expect(rows).toEqual([{ shortcode: 'ok', url: 'https://b.example/1' }]);
  });
});

describe('buildPackPublishInput', () => {
  it('assembles identifier, title, and emoji rows for a kind-30030 publish', () => {
    const input = buildPackPublishInput(
      'My Pack',
      [{ shortcode: 'wave', url: 'https://b.example/1' }],
      'emoji-pack-fixed-id',
    );
    expect(input).toEqual({
      identifier: 'emoji-pack-fixed-id',
      title: 'My Pack',
      rows: [{ shortcode: 'wave', url: 'https://b.example/1' }],
    });
  });

  it('falls back to the identifier when the title is blank', () => {
    const input = buildPackPublishInput('  ', [{ shortcode: 'wave', url: 'https://b.example/1' }], 'emoji-pack-x');
    expect(input.title).toBe('emoji-pack-x');
  });

  it('throws when no valid emoji row survives validation', () => {
    expect(() => buildPackPublishInput('Pack', [])).toThrow();
    expect(() => buildPackPublishInput('Pack', [{ shortcode: 'bad code', url: 'https://b.example/1' }])).toThrow();
  });

  it('defaults to a fresh generated uuid d-tag when none is supplied', () => {
    const input = buildPackPublishInput('Pack', [{ shortcode: 'wave', url: 'https://b.example/1' }]);
    expect(input.identifier.startsWith(EMOJI_PACK_DTAG_PREFIX)).toBe(true);
    expect(SHORTCODE_RE.test(input.identifier)).toBe(true);
  });
});
