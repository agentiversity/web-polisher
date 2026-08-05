/**
 * REAL Firefox end-to-end test (geckodriver + Selenium).
 *
 * Loads the packaged Firefox xpi as a temporary add-on, opens a local fixture
 * page, and drives the actual content -> background -> LLM pipeline through a
 * WebDriver-only bridge in the content script (active only under geckodriver).
 *
 * The provider is read from .env.local by ./provider.mjs (OPENCODE_API_KEY →
 * OpenCode Go / deepseek-v4-flash, else GEMINI_API_KEY / gemini-3.1-flash-lite).
 *
 * Usage: node e2e/firefox-e2e.mjs
 */
import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProviderConfig } from './provider.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const XPI = path.join(ROOT, '.output', 'my-polisher-extension-0.1.0-firefox.zip');
const FIXTURE = path.join(__dirname, 'fixture.html');
const PORT = 8124;
const BASE = `http://localhost:${PORT}`;

const provider = readProviderConfig();
if (!provider) {
  console.error('No API key found in .env.local (set OPENCODE_API_KEY or GEMINI_API_KEY).');
  process.exit(1);
}

function serve() {
  const html = fs.readFileSync(FIXTURE, 'utf8');
  return http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  }).listen(PORT);
}

let failures = 0;
const check = (n, c, x = '') => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' => ' + x : ''}`); };

const sel = (n) => `article[data-comment="${n}"] p`;

async function readComments(driver) {
  return driver.executeScript(`{
    const c = [];
    for (let i = 1; i <= 4; i++) {
      const el = document.querySelector('article[data-comment="' + i + '"] p');
      c.push(el ? el.textContent.trim() : null);
    }
    const ui = ['Home','Messages','Search'].every(t => [...document.querySelectorAll('button')].some(b => b.textContent.trim().includes(t)));
    return { comments: c, ui };
  }`);
}

async function applyPolish(driver) {
  await driver.executeScript(
    `document.documentElement.removeAttribute('data-text-polisher-ack');` +
    `document.documentElement.removeAttribute('data-text-polisher-done');` +
    `window.dispatchEvent(new CustomEvent('textpolisher:apply'));`,
  );
  // Ack: did the page->content bridge fire at all?
  const ack = await driver
    .wait(async () => (await driver.executeScript(`return document.documentElement.hasAttribute('data-text-polisher-ack')`)) === true, 5000)
    .then(() => true)
    .catch(() => false);
  // Result: completion = the done marker exists (any value, including "0").
  const done = await driver
    .wait(async () => (await driver.executeScript(`return document.documentElement.getAttribute('data-text-polisher-done')`)) !== null, 45000, 'polish completion')
    .then(() => true)
    .catch(() => false);
  let replaced = -1, notConfigured;
  if (done) {
    try {
      const parsed = JSON.parse(await driver.executeScript(`return document.documentElement.getAttribute('data-text-polisher-done')`));
      replaced = parsed.replaced; notConfigured = parsed.notConfigured;
    } catch { replaced = -1; }
  }
  const err = await driver.executeScript(`return document.documentElement.getAttribute('data-text-polisher-err')`);
  return { ack, replaced, notConfigured, timeout: !done, err };
}

const ORIG = [
  'I am very agree with your opinion about this matter entirely.',
  'He don\'t know what he is talking about at all really.',
  'This is so good movie I have ever seen in my whole life.',
  'She make me to do all the work for her project again.',
];

async function main() {
  const server = serve();
  let driver;
  try {
    const options = new firefox.Options();
    options.addArguments('-headless');
    driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();

    console.log('Installing xpi as temporary add-on...');
    const addonId = await driver.installAddon(XPI, true);
    console.log('Installed add-on id:', addonId);

    await driver.get(BASE + '/fixture.html');

    // 1. Content script MUST inject (this is the thing that failed in dev).
    await driver.wait(
      async () => (await driver.executeScript("return document.documentElement.getAttribute('data-text-polisher-injected')==='true'")) === true,
      15000,
    );
    console.log('PASS content script injected in Firefox (prod build)');
    console.log(`Provider: ${provider.providerId} / ${provider.model}`);
    check('Content script injected (prod Firefox)', true);

    // Seed the API key + provider config through the content-script bridge. The
    // key is passed via a DOM attribute (crosses content/page worlds in Firefox;
    // event `detail` does not), and the content script writes them to
    // browser.storage.local.
    const seedConfig = JSON.stringify({
      providerId: provider.providerId,
      baseUrl: provider.baseUrl,
      apiCompatibility: provider.apiCompatibility,
      model: provider.model,
    });
    await driver.executeScript(
      `document.documentElement.setAttribute('data-seed-key', arguments[0]);` +
      `document.documentElement.setAttribute('data-seed-config', arguments[1]);` +
      `document.documentElement.removeAttribute('data-seed-done');` +
      `window.dispatchEvent(new CustomEvent('textpolisher:setkey'));`,
      provider.apiKey, seedConfig,
    );
    const seeded = await driver
      .wait(async () => (await driver.executeScript(`return document.documentElement.hasAttribute('data-seed-done')`)) === true, 8000)
      .then(() => true).catch(() => false);
    console.log('Key seeded via bridge:', seeded);


    const before = await readComments(driver);
    console.log('BEFORE:', JSON.stringify(before.comments));

    const detail = await applyPolish(driver);
    console.log('apply detail:', JSON.stringify(detail));
    if (detail.err) console.log('POLISH ERROR:', detail.err);
    const res = detail;
    check('page->content bridge fired (ack)', !!detail.ack, `ack=${detail.ack}`);

    // Dump browser console (content-script + background logs) for diagnostics.
    try {
      const entries = await driver.manage().logs().get('browser');
      for (const e of entries) {
        if (e.level.level > 900 || e.message.includes('Text Polisher')) console.log(`[${e.level.name}] ${e.message}`);
      }
    } catch { /* console capture unsupported */ }

    const after = await readComments(driver);
    console.log('AFTER:', JSON.stringify(after.comments));

    const changed = after.comments.filter((c, i) => c != null && c !== ORIG[i]).length;
    check('LLM rewrite happened in Firefox', !res.timeout && !res.notConfigured && res.replaced >= 1,
      `replaced=${res.replaced} notConfigured=${res.notConfigured} timeout=${res.timeout}`);
    check('Comment 1 rewritten', after.comments[0] && after.comments[0] !== ORIG[0], `"${after.comments[0]}"`);
    check('UI buttons untouched', !!after.ui);

    // idempotency
    await applyPolish(driver);
    const after2 = await readComments(driver);
    check('Re-click idempotent', JSON.stringify(after2.comments) === JSON.stringify(after.comments));
  } catch (e) {
    failures++;
    console.error('ERROR:', e);
  } finally {
    if (driver) await driver.quit();
    server.close();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nALL FIREFOX CHECKS PASSED');
  process.exit(failures ? 1 : 0);
}

main();
