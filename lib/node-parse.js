// Node entry: parse old.reddit HTML string with cheerio + turndown, same core as the browser.
const cheerio = require('cheerio');
const TurndownService = require('turndown');
const core = require('./parse-old-reddit');

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
td.addRule('strike', { filter: ['del', 's'], replacement: (c) => '~~' + c + '~~' });
td.addRule('relLinks', {
  filter: (n) => n.nodeName === 'A' && /^\//.test(n.getAttribute('href') || ''),
  replacement: (c, n) => '[' + c + '](https://old.reddit.com' + n.getAttribute('href') + ')'
});

function parseHtml(html, opts = {}) {
  const $ = cheerio.load(html);
  return core.parseCheerio($, { ...opts, toMarkdown: (h) => (h ? td.turndown(h) : '') });
}

module.exports = { parseHtml, normalizeOldRedditUrl: core.normalizeOldRedditUrl, countComments: core.countComments, expandMore: core.expandMore };
