/**
 * Automated E2E test for the Text Polisher extension.
 *
 * Loads the Chrome build of the extension into a Playwright Chromium persistent
 * context, serves a local fixture page of awkward ESL comments + UI, then drives
 * the apply-polish flow end to end (content script -> background -> LLM API).
 *
 * The provider is read from .env.local by ./provider.mjs (OPENCODE_API_KEY →
 * OpenCode Go / deepseek-v4-flash, else GEMINI_API_KEY / gemini-3.1-flash-lite).
 *
 * Usage: node e2e/run-e2e.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProviderConfig } from './provider.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXT_PATH = path.join(ROOT, '.output', 'chrome-mv3');
const FIXTURE = path.join(__dirname, 'fixture.html');
const PORT = 8123;
const BASE = `http://localhost:${PORT}`;

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
    for (let i = 1; i <= 5; i++) {
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
  const provider = readProviderConfig();
  console.log(`Provider configured: ${!!provider}${provider ? ` (${provider.providerId} / ${provider.model})` : ''}`);
  if (!provider) {
    console.error('No API key found in .env.local (set OPENCODE_API_KEY or GEMINI_API_KEY).');
    process.exit(1);
  }
  const { apiKey, ...llmConfig } = provider;
  const storedConfig = { ...llmConfig, apiKey };

  const server = serve();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polisher-e2e-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.HEADLESS !== 'false',
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });

  try {
    // Wait for the background service worker
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
    console.log('Service worker:', sw.url());

    // Set the provider config in storage.local
    await sw.evaluate(async (cfg) => {
      await chrome.storage.local.set({ 'llm:config': cfg });
    }, storedConfig);

    const page = await context.newPage();
    await page.goto(BASE + '/fixture.html');

    // Wait until the content script is fully injected (webdriver-only marker
    // set after its message listener is registered), so apply-polish is never
    // sent to a not-yet-ready frame.
    try {
      await page.waitForFunction(
        () => document.documentElement?.hasAttribute('data-text-polisher-injected'),
        { timeout: 10000 },
      );
    } catch {
      // Marker unavailable (non-webdriver launch): fall back to a fixed settle.
      await page.waitForTimeout(2000);
    }

    // Small settle; comment text should be the original awkward English.
    await page.waitForTimeout(500);
    let state = await pageState(page);
    console.log('Initial comments:', JSON.stringify(state.comments));

    // ---- CASE 1: with key, transformation happens ----
    const tabs = await sw.evaluate(async (u) => chrome.tabs.query({ url: u + '/*' }), BASE);
    const tab = tabs.find((t) => t.id != null);
    const tabId = tab.id;
    console.log('Tab id:', tabId);

    // Fire the apply WITHOUT awaiting the reply so we can observe the modal
    // while the LLM call is still in flight; the reply is awaited later so
    // assertions run only after the transform actually completes.
    const applyReply = sw.evaluate((tid) => chrome.tabs.sendMessage(tid, { type: 'apply-polish' }), tabId);

    const modalSeen = await page
      .waitForSelector('#text-polisher-modal', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    check('Polishing modal appears during transform', modalSeen);

    // The indicator is brief (auto-hides) — wait until it is gone, then await
    // the apply reply for true completion.
    const modalGone = await page
      .waitForSelector('#text-polisher-modal', { state: 'detached', timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    check('Polishing modal removed after trigger', modalGone);

    await applyReply;

    // Small settle after the modal detaches, then read the final page state.
    await page.waitForTimeout(1500);

    state = await pageState(page);
    console.log('After polish:', JSON.stringify(state.comments));

    const before = ['I am very agree with your opinion about this matter entirely.',
      'He don\'t know what he is talking about at all really.',
      'This is so good movie I have ever seen in my whole life.',
      'She make me to do all the work for her project again.',
      'That was a really good movie, I enjoyed it a lot.'];
    const changed = state.comments.filter((c, i) => c != null && c !== before[i]).length;
    check('Comments got rewritten by LLM', changed >= 1, `changed=${changed}/5`);
    check('No comment became empty/blank', state.comments.every((c) => c && c.trim().length > 0));

    // UI untouched
    const uiAll = Object.values(state.ui).every(Boolean);
    check('Nav buttons still present', uiAll, JSON.stringify(state.ui));

    // Idempotency mark applied
    check('Roots marked data-text-polished', state.polished >= 1, `marked=${state.polished}`);

    // Highlight behavior: rewritten text nodes are mutated in place and their
    // parent element gets the light-blue highlight + native tooltip with the
    // original. A highlight must NEVER appear when the polished text is not
    // meaningfully different from the original.
    const highlight = await page.evaluate(() =>
      [...document.querySelectorAll('.text-polished')].map((s) => ({
        title: s.getAttribute('title') ?? '',
        text: s.textContent ?? '',
        bg: getComputedStyle(s).backgroundColor,
      })),
    );
    const norm = (x) => x.replace(/\s+/g, ' ').trim().toLowerCase();
    check('Rewrites highlighted with original as tooltip',
      highlight.length >= 1, `highlighted=${highlight.length}`);
    check('Highlighted element has light-blue background',
      highlight.length >= 1 && highlight.every((h) => h.bg === 'rgb(207, 228, 247)'),
      JSON.stringify(highlight.map((h) => h.bg)));
    check('No highlight when text is unchanged',
      highlight.every((h) => norm(h.title) !== norm(h.text)));

    // ---- CASE 2: idempotent second click ----
    const afterFirst = await pageState(page);
    await triggerPolish(sw, tabId);
    await page.waitForTimeout(3000);
    const afterSecond = await pageState(page);
    const stable = JSON.stringify(afterFirst.comments) === JSON.stringify(afterSecond.comments);
    check('Re-click is idempotent (no further changes)', stable);

    // ---- CASE 3: no-op without key ----
    await sw.evaluate(() => chrome.storage.local.remove('llm:config'));
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
