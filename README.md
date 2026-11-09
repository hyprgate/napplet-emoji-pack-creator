<!-- HYPRGATE NAPPLET MIRROR NOTICE:START -->
> This repository is a read-only mirror of the `emoji-pack-creator` napplet from `hyprgate/gui`.
> Open issues and pull requests in https://github.com/hyprgate/gui.
> Do not push commits to this standalone napplet repository; direct changes are overwritten by Hyprgate's mirror workflow.
<!-- HYPRGATE NAPPLET MIRROR NOTICE:END -->

# Emoji Pack Creator

Make a NIP-51 **kind 30030** custom emoji pack from your own images. Images upload
through the shell's NAP-UPLOAD service. Each pack is published under a collision-free
`emoji-pack-<uuid>` `d`-tag, so a new pack never overwrites an existing emoji set, and
it shows up in Emoji Browser and Emoji Sets.

The source lives in the Hyprgate monorepo at `napplets/emoji-pack-creator`. The
standalone `hyprgate/napplet-emoji-pack-creator` repository is a generated, read-only
mirror, so send changes to [hyprgate/web](https://github.com/hyprgate/web).

## Developing

Run these from the root of a Hyprgate checkout so workspace dependencies resolve:

```bash
pnpm install --frozen-lockfile
pnpm --filter ./napplets/emoji-pack-creator paja        # Kehto Paja plus the Vite dev server
pnpm --filter ./napplets/emoji-pack-creator test
pnpm --filter ./napplets/emoji-pack-creator type-check
pnpm --filter ./napplets/emoji-pack-creator conformance # builds, then checks dist/
```
