<script lang="ts">
  import { identity } from '@napplet/sdk';
  import { resourceImage } from '@hyprgate/utils';
  import { createEmojiSetStore } from '@hyprgate/utils/emoji-sets';
  import {
    buildPackPublishInput,
    generatePackIdentifier,
    publishBlocker,
    shortcodeFromFilename,
    shortcodeProblem,
    uniqueShortcode,
  } from './lib/emoji-pack';
  import { ACCEPTED_IMAGE_TYPES, MAX_EMOJI_BYTES, uploadEmojiImage, validateImageFile } from './lib/upload';

  interface StagedRow {
    key: string;
    shortcode: string;
    url: string | null;
    name: string;
    uploading: boolean;
    error: string | null;
  }

  const store = createEmojiSetStore();

  let pubkey = $state<string | null>(null);
  // Never shown: a fresh id per pack is what keeps a new pack from overwriting an old set.
  let identifier = generatePackIdentifier();
  let title = $state('');
  let staged = $state<StagedRow[]>([]);
  let publishing = $state(false);
  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let nextKey = 0;
  const filesByKey = new Map<string, File>();

  $effect(() => {
    void (async () => {
      try {
        const pk = await identity.getPublicKey();
        pubkey = pk;
        store.init(pk);
      } catch (e) {
        error = e instanceof Error ? e.message : 'Could not load your identity';
      }
    })();
    return () => store.destroy();
  });

  const readyRows = $derived(staged.filter((row) => row.url));
  const shortcodes = $derived(staged.map((row) => row.shortcode));
  const blocker = $derived(publishBlocker(title, staged));
  const canPublish = $derived(!publishing && pubkey !== null && !blocker);

  function friendlyUploadError(message: string): string {
    if (/no server configured/i.test(message)) return 'No media server set up. Add a Blossom server in Settings, then try again.';
    if (/no signer|readonly|read-only/i.test(message)) return "This session can't sign, so it can't upload. Sign in with a signer to add images.";
    return message;
  }

  function updateRow(key: string, change: Partial<StagedRow>): void {
    staged = staged.map((row) => (row.key === key ? { ...row, ...change } : row));
  }

  async function uploadRow(key: string, file: File): Promise<void> {
    updateRow(key, { uploading: true, error: null });
    try {
      const outcome = await uploadEmojiImage(file);
      updateRow(key, { url: outcome.url, uploading: false });
      filesByKey.delete(key);
    } catch (e) {
      updateRow(key, { uploading: false, error: friendlyUploadError(e instanceof Error ? e.message : 'Upload failed') });
    }
  }

  async function onFilesChosen(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    error = null;
    status = null;
    const uploads: Array<[string, File]> = [];
    for (const file of files) {
      const problem = validateImageFile(file);
      const key = `row-${nextKey++}`;
      staged = [...staged, {
        key,
        shortcode: uniqueShortcode(shortcodeFromFilename(file.name), staged.map((row) => row.shortcode)),
        url: null,
        name: file.name,
        uploading: !problem,
        error: problem,
      }];
      if (!problem) {
        filesByKey.set(key, file);
        uploads.push([key, file]);
      }
    }
    for (const [key, file] of uploads) await uploadRow(key, file);
  }

  function removeStaged(key: string): void {
    filesByKey.delete(key);
    staged = staged.filter((row) => row.key !== key);
    status = null;
  }

  async function publish(): Promise<void> {
    error = null;
    status = null;
    publishing = true;
    try {
      const input = buildPackPublishInput(
        title,
        readyRows.map((row) => ({ shortcode: row.shortcode, url: row.url! })),
        identifier,
      );
      await store.publishEmojiSet(input);
      status = `Published “${input.title}” with ${input.rows.length} emoji. It'll show up in Emoji Sets and Emoji Browser.`;
      staged = [];
      title = '';
      identifier = generatePackIdentifier();
    } catch (e) {
      error = `Couldn't publish: ${e instanceof Error ? e.message : 'something went wrong'}. Your images are still here.`;
    } finally {
      publishing = false;
    }
  }

  const acceptedKinds = ACCEPTED_IMAGE_TYPES.map((type) => type.replace('image/', '').replace('+xml', '').toUpperCase()).join(', ');
</script>

<main>
  <header>
    <h1>Make an emoji pack</h1>
    <p class="muted">Name it, add your images, and publish. Anyone can then use it.</p>
  </header>

  <section class="step">
    <h2><span class="step-number">1</span> Name your pack</h2>
    <input type="text" placeholder="e.g. My reaction pack" bind:value={title} aria-label="Pack name" />
  </section>

  <section class="step images">
    <div class="step-head">
      <h2><span class="step-number">2</span> Add images</h2>
      {#if staged.length > 0}
        <button type="button" class="ghost" onclick={() => fileInput?.click()}>＋ Add more</button>
      {/if}
    </div>
    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      multiple
      class="hidden-file"
      aria-hidden="true"
      tabindex="-1"
      onchange={onFilesChosen}
    />

    {#if staged.length === 0}
      <button type="button" class="dropzone" onclick={() => fileInput?.click()}>
        <strong>Choose images</strong>
        <span class="muted">{acceptedKinds}, up to {MAX_EMOJI_BYTES / (1024 * 1024)} MB each. You can pick several.</span>
        <span class="muted">File names become shortcodes, and you can change them after.</span>
      </button>
    {:else}
      <ul class="staged" aria-label="Images in this pack">
        {#each staged as row (row.key)}
          {@const problem = row.error ? null : shortcodeProblem(row.shortcode, shortcodes)}
          <li class="card" class:failed={!!row.error} data-staged-emoji>
            <div class="preview-frame">
              {#if row.url}
                <img class="preview" alt={`:${row.shortcode}:`} use:resourceImage={row.url} />
              {:else if row.uploading}
                <span class="muted">Uploading...</span>
              {:else}
                <span class="muted" aria-hidden="true">!</span>
              {/if}
            </div>
            <button type="button" class="remove" onclick={() => removeStaged(row.key)} aria-label={`Remove ${row.shortcode}`}>×</button>
            <label class="shortcode">
              <span class="colon" aria-hidden="true">:</span>
              <input
                type="text"
                value={row.shortcode}
                aria-label={`Shortcode for ${row.name}`}
                aria-invalid={!!problem}
                oninput={(event) => updateRow(row.key, { shortcode: event.currentTarget.value })}
              />
              <span class="colon" aria-hidden="true">:</span>
            </label>
            {#if row.error}
              <p class="row-error" role="alert">{row.error}</p>
              {#if filesByKey.has(row.key)}
                <button type="button" class="ghost" onclick={() => uploadRow(row.key, filesByKey.get(row.key)!)}>Try again</button>
              {/if}
            {:else if problem}
              <p class="row-error">{problem}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <footer>
    <div class="message" aria-live="polite">
      {#if error}<p class="error" role="alert">{error}</p>
      {:else if status}<p class="ok">{status}</p>
      {:else if blocker}<p class="muted">{blocker}</p>
      {:else}<p class="ok">Ready to publish {readyRows.length} emoji.</p>{/if}
    </div>
    <button type="button" class="publish" onclick={publish} disabled={!canPublish}>
      {publishing ? 'Publishing...' : `Publish pack (${readyRows.length})`}
    </button>
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    background: var(--hg-bg-base, #050505);
  }

  main {
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: 100vh;
    box-sizing: border-box;
    padding: 14px;
    color: var(--hg-text-primary, #f2efe7);
    background: var(--hg-bg-base, #050505);
    font-family: var(--hg-font-body, inherit);
    font-size: 13px;
  }

  h1 {
    margin: 0;
    font-size: 16px;
    font-family: var(--hg-font-title, inherit);
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 12px;
  }

  header .muted {
    margin-top: 2px;
  }

  .step {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .images {
    flex: 1;
    min-height: 0;
  }

  .step-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .step-number {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid var(--hg-accent-cyan, #82d8f7);
    color: var(--hg-accent-cyan, #82d8f7);
    font-size: 11px;
  }

  input[type='text'] {
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 4px;
    background: var(--hg-surface, #101010);
    color: var(--hg-text-primary, #f2efe7);
    font: inherit;
  }

  input[type='text']:focus {
    outline: none;
    border-color: var(--hg-accent-cyan, #82d8f7);
  }

  input[aria-invalid='true'] {
    border-color: var(--hg-accent-red, #ff6b6b);
  }

  button {
    font: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid var(--hg-accent-cyan, #82d8f7);
    outline-offset: 1px;
  }

  .hidden-file {
    display: none;
  }

  .ghost {
    min-height: 26px;
    padding: 0 10px;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 4px;
    background: var(--hg-surface, #101010);
    color: var(--hg-text-primary, #f2efe7);
    font-size: 12px;
  }

  .dropzone {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 140px;
    padding: 20px;
    border: 1px dashed var(--hg-border, #303030);
    border-radius: 8px;
    background: transparent;
    color: var(--hg-text-primary, #f2efe7);
  }

  .dropzone strong {
    color: var(--hg-accent-cyan, #82d8f7);
    font-size: 14px;
  }

  .dropzone:hover, .ghost:hover {
    border-color: var(--hg-accent-cyan, #82d8f7);
  }

  .staged {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    grid-auto-rows: min-content;
    gap: 8px;
    min-height: 0;
    margin: 0;
    padding: 2px;
    overflow: auto;
    list-style: none;
  }

  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 6px;
    background: var(--hg-surface, #101010);
  }

  .card.failed {
    border-color: var(--hg-accent-red, #ff6b6b);
  }

  .preview-frame {
    display: grid;
    place-items: center;
    height: 72px;
    border-radius: 4px;
    background: var(--hg-bg-base, #050505);
  }

  .preview {
    width: 56px;
    height: 56px;
    object-fit: contain;
  }

  .remove {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 50%;
    background: var(--hg-surface, #101010);
    color: var(--hg-text-primary, #f2efe7);
  }

  .remove:hover {
    border-color: var(--hg-accent-red, #ff6b6b);
    color: var(--hg-accent-red, #ff6b6b);
  }

  .shortcode {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .shortcode input {
    flex: 1;
    width: 100%;
    height: 26px;
    font-size: 12px;
  }

  .colon {
    color: var(--hg-text-muted, #b8b1a4);
  }

  .row-error {
    color: var(--hg-accent-red, #ff6b6b);
    font-size: 11px;
    overflow-wrap: anywhere;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--hg-border, #303030);
  }

  .message {
    min-width: 0;
    font-size: 12px;
  }

  .publish {
    flex: none;
    height: 32px;
    padding: 0 16px;
    border: 1px solid var(--hg-accent-green, #9be564);
    border-radius: 4px;
    background: var(--hg-surface, #101010);
    color: var(--hg-accent-green, #9be564);
  }

  .publish:hover:not(:disabled) {
    background: var(--hg-accent-green, #9be564);
    color: var(--hg-bg-base, #050505);
  }

  .publish:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ok {
    color: var(--hg-accent-green, #9be564);
  }

  .error {
    color: var(--hg-accent-red, #ff6b6b);
  }

  @media (max-width: 520px) {
    footer {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
