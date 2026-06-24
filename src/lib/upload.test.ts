import { describe, expect, it, vi } from 'vitest';
import type { UploadResult } from '@napplet/sdk';
import { uploadEmojiImage, validateImageFile, MAX_EMOJI_BYTES } from './upload';
import { buildPackPublishInput } from './emoji-pack';

function fakeFile(name: string, size: number, type: string): File {
  const file = new File([new Uint8Array(Math.min(size, 8))], name, { type });
  // Override size without allocating real bytes for the limit test.
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function uploadOk(url: string, sha256 = 'a'.repeat(64)): UploadResult {
  return { ok: true, uploadId: 'u1', status: 'complete', rail: 'blossom', url, sha256 };
}

describe('validateImageFile', () => {
  it('accepts a small png', () => {
    expect(validateImageFile(fakeFile('blob.png', 1024, 'image/png'))).toBeNull();
  });

  it('rejects empty, oversized, and unsupported files', () => {
    expect(validateImageFile(fakeFile('e.png', 0, 'image/png'))).toMatch(/empty/);
    expect(validateImageFile(fakeFile('big.png', MAX_EMOJI_BYTES + 1, 'image/png'))).toMatch(/too large/);
    expect(validateImageFile(fakeFile('doc.pdf', 1024, 'application/pdf'))).toMatch(/unsupported/);
  });
});

describe('uploadEmojiImage', () => {
  it('returns the shell-provided url on success', async () => {
    const uploader = vi.fn(
      async (_request: { data: Blob; filename?: string; mimeType?: string }) =>
        uploadOk('https://blossom.example/abc'),
    );
    const outcome = await uploadEmojiImage(fakeFile('wave.png', 1024, 'image/png'), uploader);
    expect(outcome.url).toBe('https://blossom.example/abc');
    expect(uploader).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'wave.png', mimeType: 'image/png' }),
    );
    // The bytes are handed to the shell as the file Blob (structured clone), not base64.
    expect(uploader.mock.calls[0]![0].data).toBeInstanceOf(Blob);
  });

  it('throws when the shell reports failure', async () => {
    const uploader = vi.fn(async (): Promise<UploadResult> => ({
      ok: false,
      uploadId: 'u1',
      status: 'failed',
      rail: 'blossom',
      error: 'server rejected',
    }));
    await expect(uploadEmojiImage(fakeFile('x.png', 1024, 'image/png'), uploader)).rejects.toThrow('server rejected');
  });

  it('throws when the result is ok but carries no url', async () => {
    const uploader = vi.fn(async (): Promise<UploadResult> => ({
      ok: true,
      uploadId: 'u1',
      status: 'complete',
      rail: 'blossom',
    }));
    await expect(uploadEmojiImage(fakeFile('x.png', 1024, 'image/png'), uploader)).rejects.toThrow();
  });
});

describe('upload-then-publish flow', () => {
  it('feeds an uploaded URL into a kind-30030 emoji tag', async () => {
    const uploader = vi.fn(async () => uploadOk('https://blossom.example/wave.png'));
    const { url } = await uploadEmojiImage(fakeFile('wave.png', 1024, 'image/png'), uploader);

    const input = buildPackPublishInput('Wave Pack', [{ shortcode: 'wave', url }], 'emoji-pack-fixed');

    // The publish input carries exactly the shape publishEmojiSet turns into
    // ['emoji', shortcode, url] tags on a kind-30030 event.
    expect(input.identifier).toBe('emoji-pack-fixed');
    expect(input.rows).toEqual([{ shortcode: 'wave', url: 'https://blossom.example/wave.png' }]);
    const emojiTags = input.rows.map((row) => ['emoji', row.shortcode, row.url]);
    expect(emojiTags).toEqual([['emoji', 'wave', 'https://blossom.example/wave.png']]);
  });
});
