/**
 * Targeted Reddit run. Live Reddit is blocked anonymously (403/login wall), so
 * this serves a faithful old.reddit + new-reddit(shadow) DOM through a URL
 * spoofed to old.reddit.com, activating the extension's REAL reddit.com site
 * profile (content selectors + exclusions) end-to-end with the live LLM.
 */
import { chromium } from 'playwright';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProviderConfig } from './provider.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(dir, '..');
const EXT = path.join(ROOT, '.output', 'chrome-mv3');
const URL = 'https://old.reddit.com/r/Test/comments/1abc/topic/';

const provider = readProviderConfig();
if (!provider) {
  console.error('No API key found in .env.local (set OPENCODE_API_KEY or GEMINI_API_KEY).');
  process.exit(1);
}

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>topic : r/Test</title></head><body>
<div id="header"><a class="submit">submit</a><input id="search"></div>
<div class="content">
  <div class="side">
    <div class="titlebox"><a>r/Test</a><a>Post</a><a>Comment</a><a>Share</a><a>Save</a><a>Hide</a></div>
    <form class="search"><input placeholder="search"></form>
  </div>
  <div class="sitetable linklisting">
    <div class="thing link">
      <div class="rank"><span>1</span></div>
      <a class="title">A completely normal English post title here</a>
      <div class="entry"><div class="usertext-body"><div class="md"><p>A rather normal paragraph that is already fairly natural.</p></div></div></div>
      <ul class="flat-list buttons"><li><a>comments</a></li><li><a>share</a></li></ul>
    </div>
  </div>
  <div class="commentarea">
    <div class="comment" data-comment="1"><div class="entry">
      <p class="tagline"><a>alex_88</a> · 12 points</p>
      <div class="usertext-body"><div class="md"><p>I am very agree with your opinion about this matter entirely.</p></div></div>
      <ul class="flat-list buttons"><li><a>reply</a></li><li><a>save</a></li></ul>
      <div class="child">
        <div class="comment" data-comment="2"><div class="entry">
          <p class="tagline"><a>mary_j</a> · 4 points</p>
          <div class="usertext-body"><div class="md"><p>He don't know what he is talking about at all really.</p></div></div>
        </div></div>
      </div>
    </div></div>
    <div class="comment" data-comment="3"><div class="entry">
      <p class="tagline"><a>bob_k</a> · 2 points</p>
      <div class="usertext-body"><div class="md"><p>This is so good movie I have ever seen in my whole life.</p></div></div>
    </div></div>
  </div>
</div>
<script>
  // new-reddit (www) uses web components + shadow DOM; recreate one to verify piercing
  (function(){
    const el = document.createElement('shreddit-comment');
    const root = el.attachShadow({mode:'open'});
    root.innerHTML = '<div class="md"><p>She make me to do all the work for her project again.</p></div><button>reply</button>';
    document.querySelector('.commentarea').appendChild(el);
  })();
</script>
</body></html>`;

let failures = 0;
const check = (n, c, x='') => { if(!c) failures++; console.log(`${c?'PASS':'FAIL'}  ${n}${x?' => '+x:''}`); };

async function main() {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'reddit-e2e-')), {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  try {
    let sw = ctx.serviceWorkers()[0]; if (!sw) sw = await ctx.waitForEvent('serviceworker',{timeout:15000});
    console.log(`Provider: ${provider.providerId} / ${provider.model}`);
    await sw.evaluate(async cfg => {
      await chrome.storage.local.set({ 'llm:config': cfg });
    }, provider);

    const page = await ctx.newPage();
    await page.route(URL, r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
    await page.goto(URL);
    await page.waitForTimeout(1000);

    // helper to snapshot comment md text + UI presence
    const snap = () => page.evaluate(() => {
      const md = c => document.querySelector(`.comment[data-comment="${c}"] div.md p`)?.textContent.trim();
      const shadowText = (() => { const el = document.querySelector('shreddit-comment'); return el?.shadowRoot?.querySelector('.md p')?.textContent.trim() ?? null; })();
      const shadows = !!document.querySelector('shreddit-comment');
      const title = document.querySelector('a.title')?.textContent.trim();
      const tagline = document.querySelector('.comment[data-comment="1"] .tagline')?.textContent.trim();
      return { md1: md(1), md2: md(2), md3: md(3), shadowText, shadows, title, tagline };
    });

    const before = await snap();
    console.log('BEFORE:', JSON.stringify(before, null, 2));

    const tabs = await sw.evaluate(async u => chrome.tabs.query({url: u + '*'} ), URL);
    // route interception means chrome.tabs.query may not match; fallback: take first non-extension tab
    let tabId = tabs.find(t => t.id != null)?.id;
    if (tabId == null) {
      const all = await sw.evaluate(() => chrome.tabs.query({}));
      tabId = all.find(t => t.id != null && !t.url?.startsWith('chrome'))?.id;
    }
    console.log('tabId', tabId);

    const reply = await sw.evaluate(async (tid) => chrome.tabs.sendMessage(tid,{type:'apply-polish'}), tabId);
    console.log('reply:', JSON.stringify(reply));
    await page.waitForTimeout(12000);

    const after = await snap();
    console.log('AFTER:', JSON.stringify(after, null, 2));

    check('reddit profile detected roots / ran', reply && reply.ok && reply.blocks > 0, `blocks=${reply?.blocks} replaced=${reply?.replaced}`);
    check('old.reddit comment 1 rewritten', after.md1 && after.md1 !== before.md1, `"${before.md1}" -> "${after.md1}"`);
    check('old.reddit comment 3 rewritten', after.md3 && after.md3 !== before.md3, `"${before.md3}" -> "${after.md3}"`);
    check('shadow-DOM comment rewritten', after.shadowText && after.shadowText !== before.shadowText, `"${before.shadowText}" -> "${after.shadowText}"`);
    check('post title (UI link) untouched', after.title === before.title, `"${after.title}"`);
    check('tagline/author UI untouched', after.tagline === before.tagline, `"${after.tagline}"`);
  } catch (e) { failures++; console.error('ERROR', e); }
  finally { await ctx.close(); }
  console.log(failures ? `\n${failures} FAILED` : '\nALL REDDIT CHECKS PASSED');
  process.exit(failures ? 1 : 0);
}
main();
