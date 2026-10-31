// Headless browser test (Chromium via Playwright): bookmarklet, extension content scripts, HTML tool paste fallback.
// Run: node test/browser.test.js   (needs: npx playwright install chromium)
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const R = (...p) => path.join(__dirname, '..', ...p);
const fixture = fs.readFileSync(R('fixtures/sample-thread.html'), 'utf8');
const THREAD = 'https://old.reddit.com/r/testsub/comments/abc123/what_is_your_favorite_cli_tool/';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.route('https://old.reddit.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: fixture }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // 1) bookmarklet: run the exact javascript: URL payload
  await page.goto(THREAD);
  const href = fs.readFileSync(R('bookmarklet.min.txt'), 'utf8').trim();
  const code = decodeURIComponent(href.replace(/^javascript:/, ''));
  await page.addScriptTag({ content: code });
  const label = await page.textContent('#__reddit_export_panel__ span');
  assert.match(label, /6 comments/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#__reddit_export_panel__ button:has-text("MD")')]);
  const md = fs.readFileSync(await dl.path(), 'utf8');
  assert.match(md, /^# What is your favorite CLI tool\?/);
  assert.match(md, /\*\*ripgrep\*\*/);
  assert.match(md, /## Comments \(6\)/);
  assert.equal(dl.suggestedFilename(), 'testsub_abc123_what-is-your-favorite-cli-tool.md');
  const [dj] = await Promise.all([page.waitForEvent('download'), page.click('#__reddit_export_panel__ button:has-text("JSON")')]);
  const j = JSON.parse(fs.readFileSync(await dj.path(), 'utf8'));
  assert.equal(j.post.title, 'What is your favorite CLI tool?');
  assert.equal(j.comments[0].replies[0].replies[0].depth, 2);
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.click('#__reddit_export_panel__ button:has-text("PDF")')]);
  await pop.waitForLoadState();
  assert.match(await pop.textContent('h1'), /favorite CLI tool/);
  console.log('PASS bookmarklet (panel, MD, JSON, print popup)');

  // 2) extension content scripts in manifest order
  const p2 = await ctx.newPage();
  await p2.goto(THREAD);
  const man = JSON.parse(fs.readFileSync(R('extension/manifest.json'), 'utf8'));
  for (const f of man.content_scripts[0].js) await p2.addScriptTag({ path: R('extension', f) });
  assert.match(await p2.textContent('#__reddit_export_panel__ span'), /6 comments/);
  const [dt] = await Promise.all([p2.waitForEvent('download'), p2.click('#__reddit_export_panel__ button:has-text("TXT")')]);
  const txt = fs.readFileSync(await dt.path(), 'utf8');
  assert.match(txt, /==== Comments \(6\) ====/);
  console.log('PASS extension content scripts (toolbar, TXT)');

  // 3) single-file HTML tool: URL rewrite + paste-source fallback
  const p3 = await ctx.newPage();
  await p3.goto('file://' + R('reddit-export.html'));
  await p3.fill('#url', 'https://www.reddit.com/r/testsub/comments/abc123/x/?utm_source=share');
  assert.equal(await p3.textContent('#urlMsg'), 'https://old.reddit.com/r/testsub/comments/abc123/x/');
  await p3.fill('#src', fixture);
  await p3.click('#parse');
  assert.match(await p3.textContent('#parseMsg'), /6 comments/);
  const [dh] = await Promise.all([p3.waitForEvent('download'), p3.click('button[data-f="md"]')]);
  assert.match(fs.readFileSync(await dh.path(), 'utf8'), /## Comments \(6\)/);
  const bmHref = await p3.getAttribute('#bm', 'href');
  assert.equal(bmHref, href);
  console.log('PASS reddit-export.html (URL rewrite, paste→parse→MD, bookmarklet href)');

  // non-thread page: bookmarklet should alert, not crash
  const p4 = await ctx.newPage();
  let alerted = '';
  p4.on('dialog', (d) => { alerted = d.message(); d.dismiss(); });
  await p4.goto('https://old.reddit.com/r/testsub/');
  await p4.addScriptTag({ content: code });
  await p4.waitForTimeout(200);
  assert.match(alerted, /old\.reddit\.com\/r\/\.\.\.\/comments/);
  console.log('PASS non-thread page guard');

  // load-more expansion from the toolbar: thread + permalink pages served from fixtures/more/
  const MORE = 'https://old.reddit.com/r/testsub/comments/m1/more_test/';
  const ctx2 = await browser.newContext({ acceptDownloads: true });
  const fetched = [];
  await ctx2.route('https://old.reddit.com/**', (r) => {
    const rest = r.request().url().slice(MORE.length).replace(/\/.*$/, '');
    if (rest) fetched.push(rest);
    r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(R('fixtures/more', (rest || 'thread') + '.html'), 'utf8') });
  });
  const p5 = await ctx2.newPage();
  p5.on('pageerror', (e) => errors.push(e.message));
  await p5.goto(MORE);
  await p5.addScriptTag({ content: code });
  assert.match(await p5.textContent('#__reddit_export_panel__ .re-label'), /3 comments \(\+2 unexpanded\)/);
  await p5.click('#__reddit_export_panel__ .re-expand');
  await p5.waitForFunction(() => /expanded from/.test(document.querySelector('#__reddit_export_panel__ .re-status').textContent), null, { timeout: 15000 });
  assert.match(await p5.textContent('#__reddit_export_panel__ .re-label'), /^Export: 9 comments$/);
  assert.equal(await p5.textContent('#__reddit_export_panel__ .re-expand'), 'Expanded ✓');
  assert.deepEqual(fetched, ['a2', 'x1', 'x2', 'd3']);
  const [dm] = await Promise.all([p5.waitForEvent('download'), p5.click('#__reddit_export_panel__ button:has-text("JSON")')]);
  const jm = JSON.parse(fs.readFileSync(await dm.path(), 'utf8'));
  assert.equal(jm.comments.length, 4);
  assert.equal(jm.comments[0].replies[0].replies[0].replies[0].replies[0].author, 'u/ivy');
  assert.ok(!JSON.stringify(jm).includes('__more'));
  console.log('PASS bookmarklet Expand (3 → 9 comments, 4 page fetches, JSON has no stubs)');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
