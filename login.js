#!/usr/bin/env node
// One-time: opens a real (headed) browser on old.reddit login. Log in, then press Enter here.
// Cookies persist in ./.reddit-profile (gitignored). Never commit that folder.
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');
const PROFILE_DIR = path.join(__dirname, '.reddit-profile');

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false, viewport: null });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto('https://old.reddit.com/login');
  console.log('Log into Reddit in the opened browser window, then press Enter here to save the session…');
  await new Promise((r) => readline.createInterface({ input: process.stdin }).once('line', r));
  await page.goto('https://old.reddit.com/');
  const user = await page.$eval('span.user a', (a) => a.textContent).catch(() => null);
  console.log(user && user !== 'login or register' ? `Saved session for u/${user} in ${PROFILE_DIR}` : 'Warning: could not confirm login; session saved anyway.');
  await ctx.close();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
