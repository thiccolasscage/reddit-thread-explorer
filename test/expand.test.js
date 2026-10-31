// Load-more expansion test: node test/expand.test.js  (no network; permalink pages come from fixtures/more/)
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { parseHtml, expandMore, countComments } = require('../lib/node-parse');

const URL0 = 'https://old.reddit.com/r/testsub/comments/m1/more_test/';
const read = (f) => fs.readFileSync(path.join(__dirname, '../fixtures/more', f), 'utf8');
const shape = (list) => list.map((c) => c.id + ':' + c.depth + (c.replies.length ? '(' + shape(c.replies) + ')' : '')).join(' ');

// fake fetcher: URL0 + <id>/ -> fixtures/more/<id>.html; records every URL asked for
function fetcher(log, failOn) {
  return async (url) => {
    log.push(url);
    const id = url.slice(URL0.length).replace(/\/.*$/, '');
    if (failOn && failOn(id)) throw Object.assign(new Error('HTTP 429'), { status: 429 });
    return parseHtml(read(id + '.html'), { url, keepMore: true });
  };
}
const fresh = (html) => parseHtml(html || read('thread.html'), { url: URL0, keepMore: true });

(async () => {
  // stubs are kept as placeholders but never counted or exported as comments
  let t = fresh();
  assert.equal(countComments(t.comments), 3);
  assert.equal(t.stats.moreLinksSkipped, 2);
  assert.ok(!JSON.stringify(parseHtml(read('thread.html'), { url: URL0 })).includes('__more'), 'default parse has no stubs');

  // full expansion: continue-this-thread page, nested load-more inside it, and the top-level load-more
  let log = [];
  await expandMore(t, { fetchThread: fetcher(log), delayMs: 0 });
  assert.equal(shape(t.comments), 'a1:0(a2:1(d1:2(d2:3(d3:4)))) b1:0 x1:0 x2:0(x3:1)');
  assert.deepEqual(log.map((u) => u.slice(URL0.length)), ['a2/', 'x1/', 'x2/', 'd3/'], 'x3 arrived inside x2, so never fetched');
  assert.deepEqual(t.stats, { commentsParsed: 9, moreLinksSkipped: 0, moreLinksExpanded: 3, pagesFetched: 4 });
  assert.ok(!JSON.stringify(t).includes('__more'));
  assert.equal(t.comments[2].author, 'u/fay');

  // child listed before its parent: fetched as its own root, then dropped once x2 brings it along
  t = fresh(read('thread.html').replace("'x1,x2,x3'", "'x3,x2,x1'"));
  log = [];
  await expandMore(t, { fetchThread: fetcher(log), delayMs: 0 });
  assert.equal(shape(t.comments), 'a1:0(a2:1(d1:2(d2:3(d3:4)))) b1:0 x2:0(x3:1) x1:0');
  assert.equal(countComments(t.comments), 9);

  // fetch budget: stops after 2 pages; unfetched ids stay counted as skipped
  t = fresh();
  log = [];
  await expandMore(t, { fetchThread: fetcher(log), delayMs: 0, maxFetches: 2 });
  assert.equal(shape(t.comments), 'a1:0(a2:1(d1:2(d2:3))) b1:0 x1:0');
  assert.equal(t.stats.moreLinksSkipped, 2);
  assert.equal(t.stats.expandStopped, 'limit');

  // keepStubs: a second run continues where the first stopped, without re-fetching pages
  t = fresh();
  log = [];
  await expandMore(t, { fetchThread: fetcher(log), delayMs: 0, maxFetches: 2, keepStubs: true });
  assert.equal(t.stats.moreLinksSkipped, 2);
  await expandMore(t, { fetchThread: fetcher(log), delayMs: 0, maxFetches: 2, keepStubs: true });
  assert.deepEqual(log.map((u) => u.slice(URL0.length)).sort(), ['a2/', 'd3/', 'x1/', 'x2/'], 'each page fetched once');
  assert.equal(shape(t.comments), 'a1:0(a2:1(d1:2(d2:3(d3:4)))) b1:0 x1:0 x2:0(x3:1)');
  assert.equal(t.stats.moreLinksSkipped, 0);

  // rate limit: first 429 stops expansion, keeps what was parsed
  t = fresh();
  log = [];
  await expandMore(t, { fetchThread: fetcher(log, (id) => id === 'x1'), delayMs: 0 });
  assert.equal(shape(t.comments), 'a1:0(a2:1(d1:2(d2:3))) b1:0');
  assert.equal(t.stats.expandStopped, 'HTTP 429');
  assert.equal(t.stats.moreLinksSkipped, 2);

  // stubs without ids/links (sample fixture uses href="#") are left as skipped, nothing fetched
  t = parseHtml(fs.readFileSync(path.join(__dirname, '../fixtures/sample-thread.html'), 'utf8'),
    { url: 'https://old.reddit.com/r/testsub/comments/abc123/x/', keepMore: true });
  log = [];
  await expandMore(t, { fetchThread: fetcher(log), delayMs: 0 });
  assert.equal(log.length, 0);
  assert.equal(t.stats.moreLinksSkipped, 2);
  assert.equal(t.stats.commentsParsed, 6);

  console.log('PASS expand: 9 comments from 4 page fetches; dedupe, budget, resume, 429 and no-op cases');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
