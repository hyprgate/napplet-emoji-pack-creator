<script lang="ts">
  import { identity } from '@napplet/sdk';
  import { resourceImage } from '@hyprgate/utils';
  import { createEmojiSetStore } from '@hyprgate/utils/emoji-sets';
  import {
    generatePackIdentifier,
    isValidShortcode,
    buildPackPublishInput,
    type StagedEmoji,
  } from './lib/emoji-pack';
  import { uploadEmojiImage, validateImageFile } from './lib/upload';

  interface StagedRow extends StagedEmoji {
    key: string;
    name: string;
  }

  const store = createEmojiSetStore();

  let pubkey = $state<string | null>(null);
  let identifier = $state(generatePackIdentifier());
  let title = $state('');
  let staged = $state<StagedRow[]>([]);
  let pendingShortcode = $state('');
  let busy = $state(false);
  let publishing = $state(false);
  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    void (async () => {
      try {
        const pk = await identity.getPublicKey();
        pubkey = pk;
        store.init(pk);
      } catch (e) {
        error = e instanceof Error ? e.message : 'could not load identity';
      }
    })();
    return () => store.destroy();
  });

  const shortcodeValid = $derived(pendingShortcode.length === 0 || isValidShortcode(pendingShortcode));
  const shortcodeTaken = $derived(staged.some((row) => row.shortcode === pendingShortcode.trim()));
  const canPublish = $derived(!publishing && pubkey !== null && staged.length > 0 && title.trim().length > 0);

  function regenerateIdentifier(): void {
    identifier = generatePackIdentifier();
    status = null;
  }

  function pickFile(): void {
    error = null;
    status = null;
    const code = pendingShortcode.trim();
    if (!isValidShortcode(code)) {
      error = 'enter a valid shortcode (letters, digits, _ or -) before choosing an image';
      return;
    }
    if (shortcodeTaken) {
      error = `shortcode :${code}: is already staged`;
      return;
    }
    fileInput?.click();
  }

  async function onFileChosen(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const code = pendingShortcode.trim();
    const validation = validateImageFile(file);
    if (validation) {
      error = validation;
      return;
    }

    busy = true;
    error = null;
    try {
      const outcome = await uploadEmojiImage(file);
      staged = [
        ...staged,
        { key: `${code}-${outcome.sha256 ?? Date.now()}`, shortcode: code, url: outcome.url, name: file.name },
      ];
      pendingShortcode = '';
      status = `Uploaded :${code}:`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'upload failed';
    } finally {
      busy = false;
    }
  }

  function removeStaged(key: string): void {
    staged = staged.filter((row) => row.key !== key);
    status = null;
  }

  async function publish(): Promise<void> {
    error = null;
    status = null;
    if (!pubkey) {
      error = 'not signed in';
      return;
    }
    publishing = true;
    try {
      const input = buildPackPublishInput(title, staged, identifier);
      await store.publishEmojiSet(input);
      status = `Published “${input.title}” (${input.rows.length} emoji) as a new pack`;
      // Reset for the next pack: a fresh uuid guarantees no overwrite.
      staged = [];
      title = '';
      identifier = generatePackIdentifier();
    } catch (e) {
      error = e instanceof Error ? e.message : 'publish failed';
    } finally {
      publishing = false;
    }
  }
</script>

<main>
  <header>
    <h1>Emoji Pack Creator</h1>
    <p class="muted">Upload custom images, name them, and publish a new kind&#8209;30030 emoji pack.</p>
  </header>

  <section class="meta">
    <label class="field title-field">
      <span>Pack title</span>
      <input
        type="text"
        placeholder="e.g. My Reaction Pack"
        bind:value={title}
        aria-label="Pack title"
      />
    </label>
    <div class="field">
      <span>Pack id (d&#8209;tag)</span>
      <div class="dtag-row">
        <code class="dtag" aria-label="Pack identifier" title={identifier}>{identifier}</code>
        <button type="button" class="ghost" onclick={regenerateIdentifier} aria-label="Regenerate pack id">
          ⟳
        </button>
      </div>
    </div>
  </section>
  <p class="hint">A unique id is generated per pack, so publishing never overwrites an existing emoji set.</p>

  <section class="add">
    <label class="field shortcode-field">
      <span>Shortcode</span>
      <input
        type="text"
        placeholder="party_blob"
        bind:value={pendingShortcode}
        aria-label="Emoji shortcode"
        class:invalid={!shortcodeValid}
      />
    </label>
    <button
      type="button"
      class="primary"
      onclick={pickFile}
      disabled={busy || !shortcodeValid || pendingShortcode.trim().length === 0}
      aria-label="Upload emoji image"
    >
      {busy ? 'Uploading…' : '＋ Upload image'}
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      class="hidden-file"
      aria-hidden="true"
      tabindex="-1"
      onchange={onFileChosen}
    />
  </section>
  {#if !shortcodeValid}
    <p class="error">Shortcodes may use letters, digits, underscores, or hyphens only.</p>
  {/if}

  <section class="staged" aria-label="Staged emoji">
    {#if staged.length === 0}
      <p class="empty">No emoji yet — add a shortcode and upload an image to stage your first emoji.</p>
    {:else}
      <ul>
        {#each staged as row (row.key)}
          <li class="chip" data-staged-emoji>
            <img class="preview" alt={`:${row.shortcode}:`} use:resourceImage={row.url} />
            <span class="code">:{row.shortcode}:</span>
            <button type="button" class="ghost remove" onclick={() => removeStaged(row.key)} aria-label={`Remove :${row.shortcode}:`}>
              ✕
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <footer>
    <button type="button" class="publish" onclick={publish} disabled={!canPublish} aria-label="Publish pack">
      {publishing ? 'Publishing…' : `Publish pack (${staged.length})`}
    </button>
    {#if status}<p class="ok" role="status">{status}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </footer>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100vh;
    box-sizing: border-box;
    padding: 14px;
    color: var(--hg-text-primary, #f2efe7);
    background: var(--hg-bg-base, #050505);
    font-family: var(--hg-font-body, inherit);
  }

  header h1 {
    margin: 0;
    font-size: 15px;
    font-family: var(--hg-font-title, inherit);
  }

  .muted {
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 11px;
    margin: 2px 0 0;
  }

  .meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .field {
    display: grid;
    gap: 3px;
  }

  .field span {
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 10px;
    text-transform: uppercase;
  }

  input[type='text'] {
    min-width: 0;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 4px;
    background: var(--hg-surface, #101010);
    color: var(--hg-text-primary, #f2efe7);
    font: inherit;
    font-size: 12px;
  }

  input[type='text']:focus {
    outline: none;
    border-color: var(--hg-accent-cyan, #82d8f7);
  }

  input.invalid {
    border-color: var(--hg-accent-red, #f78282);
  }

  .dtag-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dtag {
    flex: 1;
    min-width: 0;
    height: 28px;
    line-height: 28px;
    padding: 0 8px;
    border: 1px solid var(--hg-border-muted, #242424);
    border-radius: 4px;
    background: var(--hg-surface, #101010);
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hint {
    margin: -4px 0 0;
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 10px;
  }

  .add {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }

  .shortcode-field {
    flex: 1;
  }

  .hidden-file {
    display: none;
  }

  button {
    cursor: pointer;
    font: inherit;
    border-radius: 4px;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .primary,
  .publish {
    height: 28px;
    padding: 0 12px;
    border: 1px solid var(--hg-accent-cyan, #82d8f7);
    background: var(--hg-surface, #101010);
    color: var(--hg-text-primary, #f2efe7);
    font-size: 12px;
  }

  .publish {
    align-self: flex-start;
  }

  .ghost {
    border: 1px solid var(--hg-border, #303030);
    background: transparent;
    color: var(--hg-text-muted, #b8b1a4);
    height: 24px;
    min-width: 24px;
    font-size: 12px;
  }

  .staged {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--hg-border-muted, #242424);
    border-radius: 6px;
    padding: 8px;
  }

  .empty {
    color: var(--hg-text-muted, #b8b1a4);
    font-size: 11px;
    margin: 0;
  }

  .staged ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: 1px solid var(--hg-border, #303030);
    border-radius: 14px;
    background: var(--hg-surface, #101010);
  }

  .preview {
    width: 24px;
    height: 24px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .code {
    font-size: 11px;
    color: var(--hg-text-muted, #b8b1a4);
  }

  .remove {
    border-radius: 50%;
    height: 18px;
    min-width: 18px;
    line-height: 1;
    font-size: 10px;
  }

  footer {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .ok {
    color: var(--hg-accent-green, #82f7a0);
    font-size: 11px;
    margin: 0;
  }

  .error {
    color: var(--hg-accent-red, #f78282);
    font-size: 11px;
    margin: 0;
  }
</style>
