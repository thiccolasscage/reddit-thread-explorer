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
```
Files are written to `out/<sub>_<id>_<slug>.<ext>`. PDFs are made by Playwright `page.pdf()` from the print template. Reddit returns **403 to logged-out headless/datacenter traffic**, so run `login.js` first.

## Tests (no Reddit needed)
```bash
npm test               # node test/parse.test.js: parser + exporters on fixtures/sample-thread.html
npm run test:browser   # headless Chromium: bookmarklet, extension scripts, HTML tool paste fallback
```

## Layout / editing
- `lib/parse-old-reddit.js`: the shared parser, with a DOM adapter for the browser and a cheerio adapter for Node.
- `lib/html-to-md-dom.js`: the browser HTML→MD converter. Node uses turndown, via `lib/node-parse.js`.
- `lib/export.js`: renders MD / JSON / TXT / print HTML.
- `lib/browser-ui.js`: the in-page toolbar.
- After you edit `lib/`, run **`npm run build`**. It regenerates `bookmarklet.js`, `bookmarklet.min.txt`, `reddit-export.html` (from `scripts/reddit-export.template.html`) and `extension/lib/`.

## Output shape
`{ url, fetchedAt, post:{id, subreddit, title, author, score, createdAt, body(md), flair, nsfw, linkUrl?}, comments:[{id, author, score, createdAt, body(md), depth, replies:[…], stickied?, collapsed?}], stats:{commentsParsed, moreLinksSkipped} }`
`score` is `null` when the score is hidden. Deleted authors show as `[deleted]`.

## Limits (v0, by design)
- Only comments already in the page get exported. "load more comments" / "continue this thread" aren't expanded; they're counted in `stats.moreLinksSkipped`. Add `?limit=500` to the URL to get more comments per page.
- No www/shreddit parsing, no public `.json`, no multi-user hosting.
