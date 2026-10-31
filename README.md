# old.reddit thread export

Export an **old.reddit.com** thread (post + comments) as **Markdown, JSON, TXT, or PDF**.
It parses the page HTML only. It never calls Reddit's public `.json` API. Any `www.`/`reddit.com` link gets rewritten to `old.reddit.com`. Only `/comments/` URLs are accepted.

The tools are listed in ship order. All of them share `lib/`:

| | Path | Install |
|---|---|---|
| 1 | Bookmarklet + `reddit-export.html` (MVP) | none |
| 2 | Firefox extension `extension/` | temporary add-on |
| 3 | CLI + Playwright | `npm install` |

## 1. Bookmarklet + single-file HTML tool (MVP)
1. Open `reddit-export.html` in your browser. It's one self-contained file.
2. Drag **⇩ Reddit Export** to your bookmarks bar. You can also click **Copy bookmarklet code** and paste it as a new bookmark's URL. The raw `javascript:` URL is in `bookmarklet.min.txt`, and the readable source is `bookmarklet.js`.
3. Paste any thread URL, then click **Open on old.reddit**. Make sure you're logged in, in your own browser.
4. On the thread, click the bookmark. A toolbar appears with **MD · JSON · TXT · Print → PDF · Copy MD**. For PDF, use the print dialog → *Save as PDF*.
5. If the thread has collapsed parts, the toolbar also shows **Expand N more**. See [Load more comments](#load-more-comments).

**Fallback:** if a bookmarklet won't run, open the page source of the thread (`Ctrl/⌘+U`), copy all of it, and paste it into section 3 of the HTML tool. Then click **Parse** and choose a format. The page can't fetch reddit directly because CORS blocks it.

## 2. Firefox extension (temporary add-on)
1. Go to `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
2. Select `extension/manifest.json`.
3. Open any `old.reddit.com/r/…/comments/…` page. A toolbar shows up bottom-right with **MD · JSON · TXT · Print → PDF · Copy MD**.

The manifest is MV2. Firefox unloads temporary add-ons when it restarts, so you'll need to load it again after that. To install it permanently, sign it through AMO (`web-ext sign`).

## 3. CLI + Playwright
```bash
npm install
npx playwright install chromium      # one-time browser download
node login.js                        # opens a browser: log into Reddit, press Enter → saved in .reddit-profile/ (gitignored)
node cli.js "https://www.reddit.com/r/sub/comments/abc123/slug/" --format md        # md|json|txt|pdf|html|all
node cli.js --from-html saved-page.html --format all                                # offline, from a saved page
node cli.js "<thread url>" --expand --format all                                    # also fetch load-more pages (--max-fetches 40, --delay 1500)
```
Files are written to `out/<sub>_<id>_<slug>.<ext>`. PDFs are made by Playwright `page.pdf()` from the print template. Reddit returns **403 to logged-out headless/datacenter traffic**, so run `login.js` first.

## Tests (no Reddit needed)
```bash
npm test               # parse.test.js (parser + exporters on fixtures/sample-thread.html) + expand.test.js (load-more on fixtures/more/)
npm run test:browser   # headless Chromium: bookmarklet, extension scripts, HTML tool paste fallback, Expand button
```

## Folder tree
Files marked *(generated)* are rebuilt by `npm run build`. Don't edit them by hand.

```text
reddit-thread-explorer/
├── lib/                          # shared source: edit here
│   ├── parse-old-reddit.js       #   parser (DOM adapter for browser, cheerio adapter for Node)
│   ├── html-to-md-dom.js         #   browser HTML→MD converter
│   ├── node-parse.js             #   Node entry: cheerio + turndown
│   ├── export.js                 #   MD / JSON / TXT / print-HTML renderers
│   └── browser-ui.js             #   in-page toolbar
├── extension/                    # 2. Firefox extension (MV2)
│   ├── manifest.json
│   ├── content.js
│   └── lib/                      #   (generated) copies of lib/*.js
├── scripts/
│   ├── build-bookmarklet.js      #   `npm run build`
│   └── reddit-export.template.html  # template for reddit-export.html
├── fixtures/
│   ├── sample-thread.html        # saved old.reddit page used by the tests
│   └── more/                     # synthetic thread + comment permalink pages for the load-more tests
├── test/
│   ├── parse.test.js             # `npm test`
│   ├── expand.test.js            # `npm test`: load-more expansion
│   └── browser.test.js           # `npm run test:browser`
├── bookmarklet.js                # 1. (generated) readable bookmarklet source
├── bookmarklet.min.txt           # 1. (generated) javascript: URL
├── reddit-export.html            # 1. (generated) single-file HTML tool
├── cli.js                        # 3. CLI entry
├── fetch-thread.js               # 3. Playwright fetch using the saved login profile
├── login.js                      # 3. one-time Reddit login → .reddit-profile/
├── CLAUDE.md                     # agent handoff
├── package.json
└── package-lock.json
```

Not committed: `node_modules/`, `out/` (CLI output), `.env`, `.reddit-profile/`.

## Output shape
`{ url, fetchedAt, post:{id, subreddit, title, author, score, createdAt, body(md), flair, nsfw, linkUrl?}, comments:[{id, author, score, createdAt, body(md), depth, replies:[…], stickied?, collapsed?}], stats:{commentsParsed, moreLinksSkipped} }`
`score` is `null` when the score is hidden. Deleted authors show as `[deleted]`. After an expand, `stats` also has `moreLinksExpanded`, `pagesFetched`, and `expandStopped` (`limit` or `HTTP 403/429`) if it stopped early.

## Load more comments
By default only the comments already on the page get exported. Anything still behind a link is counted in `stats.moreLinksSkipped`. Adding `?limit=500` to the URL puts more comments on the first page.

To fetch the rest, use **Expand N more** in the toolbar (bookmarklet or extension) or `--expand` on the CLI. It stays HTML-only, with no `.json` and no `/api/morechildren`:
- **continue this thread** links point to the parent comment's permalink page. That page is fetched and its replies are merged in.
- **load more comments** buttons list the hidden comment ids in their `onclick`. Each id's own permalink page (`/r/<sub>/comments/<post>/<slug>/<id>/`) is fetched and its whole subtree merged in. Ids that arrive inside an earlier subtree are skipped, and duplicates are dropped.
- Stubs inside fetched pages get expanded too, up to the page limit: 40 by default (`--max-fetches`). The toolbar can be clicked again to keep going. Pages are fetched about 1 per second (CLI: `--delay 1500` ms).
- An HTTP 403 or 429 stops expansion and keeps everything fetched so far.
- The toolbar uses same-origin fetches with your logged-in session. The CLI reuses the Playwright profile from `login.js`. The pasted-source fallback in `reddit-export.html` can't expand, because it can't reach reddit.

## Limits (by design)
- No www/shreddit parsing, no public `.json` or `/api/` calls, no multi-user hosting.
- Load-more expansion costs one page load per hidden comment, so a thread with hundreds of hidden comments takes several runs (or a higher `--max-fetches`).
