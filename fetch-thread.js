// Fetch an old.reddit thread's HTML with Playwright using the persistent login profile in ./.reddit-profile
const path = require('path');
const { chromium } = require('playwright');
const { normalizeOldRedditUrl } = require('./lib/parse-old-reddit');

const PROFILE_DIR = path.join(__dirname, '.reddit-profile');

// One logged-in browser for several page loads (the thread, then any load-more pages).
async function openSession({ headless = true, timeoutMs = 45000 } = {}) {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1280, height: 900 },
    userAgent: undefined // real Chromium UA from the profile
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  async function fetchHtml(url) {
    const target = normalizeOldRedditUrl(url);
    const res = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (res && res.status() >= 400) {
      const e = new Error(`HTTP ${res.status()} for ${target} (blocked or login expired? run: node login.js)`);
      e.status = res.status();
      throw e;
    }
    const ok = await page.waitForSelector('#siteTable .thing.link', { timeout: timeoutMs }).catch(() => null);
    if (!ok) {
      const title = await page.title();
      throw new Error(`No thread found at ${target} (page title: "${title}"). Login expired / blocked / not a thread? Try: node login.js`);
    }
    await page.waitForSelector('.commentarea', { timeout: 5000 }).catch(() => {});
    return { url: page.url(), html: await page.content() };
  }
  return { fetchHtml, close: () => ctx.close() };
}

async function fetchThreadHtml(url, opts = {}) {
  const s = await openSession(opts);
  try {
    return await s.fetchHtml(url);
  } finally {
    await s.close();
  }
}

async function htmlToPdf(html, outPath) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: outPath, format: 'Letter', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' } });
  } finally {
    await browser.close();
  }
}

module.exports = { openSession, fetchThreadHtml, htmlToPdf, PROFILE_DIR };
