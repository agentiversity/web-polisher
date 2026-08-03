/**
 * Automated E2E test for the Text Polisher extension.
 *
 * Loads the Chrome build of the extension into a Playwright Chromium persistent
 * context, serves a local fixture page of awkward ESL comments + UI, then drives
 * the apply-polish flow end to end (content script -> background -> Gemini API).
 *
 * Usage: node e2e/run-e2e.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXT_PATH = path.join(ROOT, '.output', 'chrome-mv3');
const FIXTURE = path.join(__dirname, 'fixture.html');
const PORT = 8123;
const BASE = `http://localhost:${PORT}`;

// Read the real Gemini key from .env.local
function readKey() {
  const raw = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = raw.match(/^GEMINI_API_KEY=(.+)$/m);
  return m ? m[1].trim() : undefined;
}

function serve() {
  const html = fs.readFileSync(FIXTURE, 'utf8');
  return http
    .createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    })
    .listen(PORT);
}

let failures = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  => ' + extra : ''}`);
}

const UI_TEXTS = ['Home', 'Messages', 'Search'];
const sel = (n) => `article[data-comment="${n}"] p`;

async function pageState(page) {
  return page.evaluate(() => {
    const comments = [];
    for (let i = 1; i <= 4; i++) {
      const el = document.querySelector(`article[data-comment="${i}"] p`);
      comments.push(el ? el.textContent.trim() : null);
    }
    const btns = [...document.querySelectorAll('button')];
    const ui = {
      Home: btns.some((b) => b.textContent.trim().includes('Home')),
      Messages: btns.some((b) => b.textContent.trim().includes('Messages')),
      Search: btns.some((b) => b.textContent.trim().includes('Search')),
    };
    const polished = document.querySelectorAll('[data-text-polished]').length;
    return { comments, ui, polished };
  });
}

async function triggerPolish(sw, tabId) {
  const reply = await sw.evaluate(async (tid) => {
    return chrome.tabs.sendMessage(tid, { type: 'apply-polish' });
  }, tabId);
  return reply;
}

async function main() {
  const apiKey = readKey();
  console.log(`API key present: ${!!apiKey}`);

  const server = serve();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polisher-e2e-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });

  try {
    // Wait for the background service worker
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
    console.log('Service worker:', sw.url());

    // Set the API key in storage.local
    await sw.evaluate(async (k) => {
      await chrome.storage.local.set({ 'gemini:apiKey': k });
    }, apiKey);

    const page = await context.newPage();
    await page.goto(BASE + '/fixture.html');

    // Small settle; comment text should be the original awkward English.
    await page.waitForTimeout(500);
    let state = await pageState(page);
    console.log('Initial comments:', JSON.stringify(state.comments));

    // ---- CASE 1: with key, transformation happens ----
    const tabs = await sw.evaluate(async (u) => chrome.tabs.query({ url: u + '/*' }), BASE);
    const tab = tabs.find((t) => t.id != null);
    const tabId = tab.id;
    console.log('Tab id:', tabId);

    const reply = await triggerPolish(sw, tabId);
    console.log('apply-polish reply:', JSON.stringify(reply));

    // Wait for the (slow) LLM to finish applying.
    await page.waitForTimeout(12000);

    state = await pageState(page);
    console.log('After polish:', JSON.stringify(state.comments));

    const before = ['I am very agree with your opinion about this matter entirely.',
      'He don\'t know what he is talking about at all really.',
      'This is so good movie I have ever seen in my whole life.',
      'She make me to do all the work for her project again.'];
    const changed = state.comments.filter((c, i) => c != null && c !== before[i]).length;
    check('Comments got rewritten by LLM', changed >= 1, `changed=${changed}/4`);
    check('No comment became empty/blank', state.comments.every((c) => c && c.trim().length > 0));

    // UI untouched
    const uiAll = Object.values(state.ui).every(Boolean);
    check('Nav buttons still present', uiAll, JSON.stringify(state.ui));

    // Idempotency mark applied
    check('Roots marked data-text-polished', state.polished >= 1, `marked=${state.polished}`);

    // ---- CASE 2: idempotent second click ----
    const afterFirst = await pageState(page);
    await triggerPolish(sw, tabId);
    await page.waitForTimeout(3000);
    const afterSecond = await pageState(page);
    const stable = JSON.stringify(afterFirst.comments) === JSON.stringify(afterSecond.comments);
    check('Re-click is idempotent (no further changes)', stable);

    // ---- CASE 3: no-op without key ----
    await sw.evaluate(() => chrome.storage.local.remove('gemini:apiKey'));
    // New page load so roots are un-marked and eligible again.
    await page.reload();
    await page.waitForTimeout(500);
    const beforeNoKey = await pageState(page);
    await triggerPolish(sw, tabId);
    await page.waitForTimeout(4000);
    const afterNoKey = await pageState(page);
    check('No-key click is a no-op (no changes)',
      JSON.stringify(beforeNoKey.comments) === JSON.stringify(afterNoKey.comments));
  } catch (err) {
    failures++;
    console.error('ERROR:', err);
  } finally {
    await context.close();
    server.close();
  }

  console.log(failures === 0 ? '\nALL E2E CHECKS PASSED' : `\n${failures} E2E CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
