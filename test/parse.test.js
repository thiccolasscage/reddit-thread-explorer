// Fixture test: node test/parse.test.js  (no network, no Reddit)
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { parseHtml, normalizeOldRedditUrl, countComments } = require('../lib/node-parse');
const exp = require('../lib/export');

const html = fs.readFileSync(path.join(__dirname, '../fixtures/sample-thread.html'), 'utf8');
const t = parseHtml(html, { url: 'https://www.reddit.com/r/testsub/comments/abc123/what_is_your_favorite_cli_tool/?utm_source=share' });

// URL normalization
assert.equal(t.url, 'https://old.reddit.com/r/testsub/comments/abc123/what_is_your_favorite_cli_tool/');
assert.equal(normalizeOldRedditUrl('reddit.com/r/a/comments/x1/y'), 'https://old.reddit.com/r/a/comments/x1/y');
assert.throws(() => normalizeOldRedditUrl('https://old.reddit.com/r/testsub/'), /comments/);
assert.throws(() => normalizeOldRedditUrl('https://example.com/r/a/comments/x'), /reddit/);

// post
assert.equal(t.post.id, 'abc123');
assert.equal(t.post.subreddit, 'testsub');
assert.equal(t.post.title, 'What is your favorite CLI tool?');
assert.equal(t.post.author, 'u/alice_dev');
assert.equal(t.post.score, 1234);
assert.equal(t.post.flair, 'Discussion');
assert.equal(t.post.nsfw, false);
assert.equal(t.post.createdAt, '2023-11-14T22:13:20.000Z');
assert.match(t.post.body, /\*\*ripgrep\*\*/);
assert.match(t.post.body, /\[the repo\]\(https:\/\/github.com\/BurntSushi\/ripgrep\)/);

// comments
assert.equal(t.comments.length, 3, 'top-level comments');
assert.equal(countComments(t.comments), 6, 'total comments');
assert.equal(t.stats.moreLinksSkipped, 2);
const [c1, c4, c6] = t.comments;
assert.equal(c1.id, 'c1'); assert.equal(c1.author, 'u/bob'); assert.equal(c1.score, 321); assert.equal(c1.depth, 0);
assert.equal(c1.createdAt, '2023-11-14T23:00:00.000Z');
assert.equal(c1.replies[0].author, 'u/carol'); assert.equal(c1.replies[0].depth, 1);
assert.equal(c1.replies[0].replies[0].depth, 2);
assert.match(c1.replies[0].replies[0].body, /^> bat previews/);
assert.equal(c4.author, '[deleted]');
assert.equal(c4.replies[0].score, null, 'hidden score -> null');
assert.match(c4.replies[0].body, /```/);
assert.equal(c6.stickied, true);
assert.match(c6.body, /https:\/\/old.reddit.com\/r\/commandline/);

// exporters
const md = exp.toMarkdown(t), txt = exp.toText(t), json = exp.toJSON(t), html2 = exp.toPrintHtml(t);
assert.match(md, /^# What is your favorite CLI tool\?/);
assert.match(md, /## Comments \(6\)/);
assert.match(md, /^> > \*\*u\/bob\*\*/m);
assert.ok(!/\*\*/.test(txt), 'txt has no markdown bold');
assert.deepEqual(JSON.parse(json).post.title, t.post.title);
assert.match(html2, /<h1>What is your favorite CLI tool\?<\/h1>/);
assert.equal(exp.fileBase(t), 'testsub_abc123_what-is-your-favorite-cli-tool');

console.log('PASS fixture: title="%s" top=%d total=%d', t.post.title, t.comments.length, countComments(t.comments));
