# reddit-thread-explorer: agent handoff

old.reddit-only thread exporter: MD / JSON / TXT / PDF. Ship order: shared parser → bookmarklet + single-file HTML (MVP, shipped) → Firefox temporary extension → CLI / Playwright.

## Source of truth
GitHub is canonical. The Drive folder `SFW/reddit-thread-explorer` (id `1-o4eGh3VX6dY6vHLtZ2xxBb7BxyfOzFj`) only holds pickup/export copies (`reddit-export.html`, seed tarball).

## Ownership
SFW lane. Not part of the NSFW Aisle 69 cleanup.

## Rules
- Edit `lib/`, then `npm run build`. Never hand-edit the generated files (see README folder tree).
- `npm test` must pass before pushing.

## v0 cuts
No www/shreddit parsing, no public `.json` API, no SaaS/hosting, no full "load more" expansion.
