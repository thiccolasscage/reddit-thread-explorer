#!/usr/bin/env node
// node cli.js <old.reddit url> --format md|json|txt|pdf|all --out ./out
// node cli.js --from-html fixtures/sample-thread.html --format all   (offline)
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { parseHtml, normalizeOldRedditUrl, countComments } = require('./lib/node-parse');
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
  .action(async (url, opts) => {
    try {
      let html, srcUrl;
      if (opts.fromHtml) {
        html = fs.readFileSync(opts.fromHtml, 'utf8');
        srcUrl = url ? normalizeOldRedditUrl(url) : undefined;
      } else {
        if (!url) throw new Error('URL required (or use --from-html <file>)');
        srcUrl = normalizeOldRedditUrl(url);
        const { fetchThreadHtml } = require('./fetch-thread');
        console.error('Fetching', srcUrl);
        ({ html } = await fetchThreadHtml(srcUrl, { headless: !opts.headed }));
      }
      const thread = parseHtml(html, { url: srcUrl, maxDepth: opts.maxDepth });
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
