/**
 * emoji-pack.ts — pure pack-build logic for the Emoji Pack Creator napplet.
 *
 * This module owns the *new* surface for issue #185:
 *   - collision-free `emoji-pack-<uuid>` `d`-tag generation (never overwrites an
 *     existing kind-30030 set, unlike Manager's editable human slug);
 *   - shortcode validation (NIP-30 `^[A-Za-z0-9_-]+$`);
 *   - assembling staged (shortcode + uploaded URL) entries into the
 *     `EmojiSetDraftRow[]` that `@hyprgate/utils` `publishEmojiSet` consumes.
 *
 * The actual kind-30030 publish (event shape, `['emoji', shortcode, url]` tags,
 * `30030:<pubkey>:<identifier>` address, 10030 mirror) is REUSED from
 * `@hyprgate/utils` `createEmojiSetStore().publishEmojiSet` — no third copy of
 * emoji-sets.ts. Image bytes reach a stable URL through the shell's NAP-UPLOAD
 * service (`upload.upload`), never a napplet-local uploader.
 */

import type { EmojiSetDraftRow, PublishEmojiSetInput } from '@hyprgate/utils/emoji-sets';

/** NIP-30 custom-emoji shortcode grammar (matches the utils validator). */
export const SHORTCODE_RE = /^[A-Za-z0-9_-]+$/;

/** Reserved prefix for Creator-authored packs. Standardized so other surfaces
 *  (Browser/Manager) can recognize packs created via this flow. */
export const EMOJI_PACK_DTAG_PREFIX = 'emoji-pack-';

/** A staged emoji: a validated shortcode plus the https URL of an uploaded image. */
export interface StagedEmoji {
  shortcode: string;
  url: string;
}

/** Generate a collision-free `emoji-pack-<uuid>` identifier (NIP-30 d-tag).
 *
 *  `crypto.randomUUID()` yields a lowercase hyphenated v4 UUID, so the result
 *  always satisfies {@link SHORTCODE_RE} (the identifier validator). A fresh
 *  uuid guarantees the published kind-30030 never overwrites an existing set. */
export function generatePackIdentifier(randomUuid: () => string = crypto.randomUUID.bind(crypto)): string {
  return `${EMOJI_PACK_DTAG_PREFIX}${randomUuid()}`;
}

/** True when `value` is a valid emoji shortcode. */
export function isValidShortcode(value: string): boolean {
  return SHORTCODE_RE.test(value.trim());
}

/** True when `value` is an https URL (the shape uploaded blobs return). */
export function isUploadedUrl(value: string): boolean {
  return /^https:\/\/[^\s<>"']+$/i.test(value.trim());
}

/**
 * Convert staged emoji into the deduped `EmojiSetDraftRow[]` that
 * `publishEmojiSet` turns into `['emoji', shortcode, url]` tags. Rows with an
 * invalid shortcode, a non-https URL, or a duplicate shortcode are dropped so a
 * malformed entry can never produce a malformed 30030.
 */
export function buildDraftRows(entries: StagedEmoji[]): EmojiSetDraftRow[] {
  const seen = new Set<string>();
  const rows: EmojiSetDraftRow[] = [];
  for (const entry of entries) {
    const shortcode = entry.shortcode.trim();
    const url = entry.url.trim();
    if (!isValidShortcode(shortcode) || !isUploadedUrl(url) || seen.has(shortcode)) continue;
    seen.add(shortcode);
    rows.push({ shortcode, url });
  }
  return rows;
}

/**
 * Assemble the full publish input for a pack: a fresh uuid d-tag, the title,
 * and the staged emoji as draft rows. Throws when no row survives validation so
 * the UI never publishes an empty pack.
 */
export function buildPackPublishInput(
  title: string,
  entries: StagedEmoji[],
  identifier: string = generatePackIdentifier(),
): PublishEmojiSetInput {
  const rows = buildDraftRows(entries);
  if (rows.length === 0) throw new Error('add at least one emoji with a valid shortcode and uploaded image');
  return { identifier, title: title.trim() || identifier, rows };
}
