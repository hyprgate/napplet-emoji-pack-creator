/**
 * upload.ts — NAP-UPLOAD client wrapper for the Emoji Pack Creator.
 *
 * Hands raw image bytes to the shell's upload service (`upload.upload`). The
 * shell selects a server, signs the rail authorization (NIP-98 for NIP-96,
 * kind 24242 for Blossom), performs the HTTP upload, and returns a stable URL.
 * Napplets never see signing keys, server credentials, or direct network
 * access — the host is the policy/consent boundary (runtime-owned rails).
 */

import { upload, type UploadResult } from '@napplet/sdk';

/** Conservative client-side guards for emoji images (small square art). The
 *  shell enforces its own policy/limits; these are a fast-fail UX layer. */
export const MAX_EMOJI_BYTES = 1024 * 1024; // 1 MiB
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/gif', 'image/webp', 'image/jpeg', 'image/svg+xml'];

export interface UploadOutcome {
  url: string;
  sha256?: string;
  mimeType?: string;
}

/** Validate a file before handing it to the shell. Returns an error string, or
 *  null when the file is acceptable. */
export function validateImageFile(file: File): string | null {
  if (file.size === 0) return 'file is empty';
  if (file.size > MAX_EMOJI_BYTES) return `image is too large (max ${Math.round(MAX_EMOJI_BYTES / 1024)} KiB)`;
  if (file.type && !ACCEPTED_IMAGE_TYPES.includes(file.type)) return `unsupported image type: ${file.type}`;
  return null;
}

/**
 * Upload one image file through NAP-UPLOAD and return its stable URL.
 *
 * Thin seam over `upload.upload` so the App component and the unit tests share
 * one path; the injectable `uploader` lets tests mock the shell hook without a
 * live runtime.
 */
export async function uploadEmojiImage(
  file: File,
  uploader: (request: { data: Blob; filename?: string; mimeType?: string }) => Promise<UploadResult> = (request) =>
    upload.upload(request),
): Promise<UploadOutcome> {
  const result = await uploader({ data: file, filename: file.name, mimeType: file.type || undefined });
  if (!result.ok || !result.url) {
    throw new Error(result.error ?? 'upload failed');
  }
  return { url: result.url, sha256: result.sha256, mimeType: result.mimeType };
}
