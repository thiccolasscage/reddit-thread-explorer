#!/usr/bin/env node
// node cli.js <old.reddit url> --format md|json|txt|pdf|all --out ./out
// node cli.js --from-html fixtures/sample-thread.html --format all   (offline)
// node cli.js <url> --expand [--max-fetches 40]   (also fetch "load more" / "continue this thread" pages)
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { parseHtml, normalizeOldRedditUrl, countComments, expandMore } = require('./lib/node-parse');
const exp = require('./lib/export');

const program = new Command();
program
  .name('reddit-export')
  .argument('[url]', 'thread URL (rewritten to old.reddit.com)')
  .option('-f, --format <fmt>', 'md | json | txt | pdf | html | all (comma list ok)', 'md')
  .option('-o, --out <dir>', 'output directory', path.join(__dirname, 'out'))
  .option('--from-html <file>', 'parse a saved old.reddit page instead of fetching')
  .option('--headed', 'show the browser while fetching')
  .option('--max-depth <n>', 'max reply depth to keep', (v) => parseInt(v, 10))
  .option('--expand', 'fetch "load more comments" / "continue this thread" pages and merge them in')
  .option('--max-fetches <n>', 'page limit for --expand', (v) => parseInt(v, 10), 40)
  .option('--delay <ms>', 'pause between --expand page loads', (v) => parseInt(v, 10), 1500)
  .action(async (url, opts) => {
    try {
      let html, srcUrl, session;
      if (opts.expand && opts.fromHtml) throw new Error('--expand needs a live URL (it fetches more pages); drop --from-html');
      if (opts.fromHtml) {
        html = fs.readFileSync(opts.fromHtml, 'utf8');
        srcUrl = url ? normalizeOldRedditUrl(url) : undefined;
      } else {
        if (!url) throw new Error('URL required (or use --from-html <file>)');
        srcUrl = normalizeOldRedditUrl(url);
        const { openSession } = require('./fetch-thread');
        console.error('Fetching', srcUrl);
        session = await openSession({ headless: !opts.headed });
        ({ html } = await session.fetchHtml(srcUrl));
      }
      let thread;
      try {
        thread = parseHtml(html, { url: srcUrl, maxDepth: opts.maxDepth, keepMore: !!opts.expand });
        if (opts.expand) {
          await expandMore(thread, {
            maxFetches: opts.maxFetches, delayMs: opts.delay,
            fetchThread: async (u) => parseHtml((await session.fetchHtml(u)).html, { url: u, maxDepth: opts.maxDepth, keepMore: true }),
            onProgress: (p) => console.error(`  load-more page ${p.fetched}/${p.max}`)
          });
          if (opts.maxDepth != null) { // merged subtrees can run deeper than --max-depth
            const cut = (list) => list.filter((c) => c.depth <= opts.maxDepth).map((c) => ((c.replies = cut(c.replies)), c));
            thread.comments = cut(thread.comments);
            thread.stats.commentsParsed = countComments(thread.comments);
          }
          const st = thread.stats;
          console.error(`Expanded ${st.moreLinksExpanded} load-more links from ${st.pagesFetched} pages` +
            (st.expandStopped ? ` (stopped: ${st.expandStopped}${st.expandStopped === 'limit' ? ', raise --max-fetches' : ''})` : ''));
        }
      } finally {
        if (session) await session.close();
      }
      const formats = opts.format === 'all' ? ['md', 'json', 'txt', 'pdf'] : opts.format.split(',').map((s) => s.trim());
      fs.mkdirSync(opts.out, { recursive: true });
      const base = path.join(opts.out, exp.fileBase(thread));
      for (const f of formats) {
        const file = `${base}.${f}`;
        if (f === 'pdf') {
          const { htmlToPdf } = require('./fetch-thread');
          await htmlToPdf(exp.toPrintHtml(thread), file);
        } else {
          fs.writeFileSync(file, exp.render(thread, f));
        }
        console.log(file);
      }
      console.error(`"${thread.post.title}" — ${countComments(thread.comments)} comments` +
        (thread.stats.moreLinksSkipped ? ` (${thread.stats.moreLinksSkipped} load-more links not expanded)` : ''));
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  });
program.parse();
