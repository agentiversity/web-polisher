// @vitest-environment node
/**
 * LIVE integration test (task 7.4, automated portion).
 *
 * Runs the ACTUAL production pipeline end-to-end against the REAL Gemini API:
 *   polish.ts (collect → apply → idempotency)  +  llmClient.ts (real API call)
 *
 * Real user-generated English comes from the Hacker News API (open, no auth).
 * NOTE: Reddit's public .json API now redirects anonymous clients to a
 * "Welcome" interstitial (403/302), so it can't be used without OAuth; we
 * therefore pair real HN comments with a small set of realistic *imperfect*
 * English fixtures that mirror the comments this product targets, so the
 * rewrite is visibly exercised.
 *
 * Runs under the `node` environment (not jsdom) because jsdom replaces the
 * global AbortController with its own, whose signal is not an instance of
 * Node's AbortSignal — Node's undici fetch (underneath @google/generative-ai)
 * rejects that signal. A real browser's AbortSignal matches the browser fetch,
 * so this is purely a test-harness concern. We install a minimal jsdom DOM
 * manually to still exercise the real DOM walkers.
 *
 * Requires the GEMINI_API_KEY env var. Skipped automatically when unset, so it
 * never breaks the normal offline test suite.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { polishContent } from './polish';
import { transform } from './llmClient';

const KEY_ENV = 'GEMINI_API_KEY';
const STORAGE_KEY = 'gemini:apiKey';
const apiKey = (process.env[KEY_ENV] ?? '').trim();
const hasKey = apiKey.length > 0;

const mocks = vi.hoisted(() => ({
  storageGet: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: { local: { get: mocks.storageGet } },
    runtime: { sendMessage: mocks.sendMessage },
  },
}));

/** Install a jsdom DOM onto the node global so the real DOM walkers run. */
function installDom(): void {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://example.com/',
  });
  const w = dom.window as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    Node: w.Node,
    Element: w.Element,
    HTMLElement: w.HTMLElement,
    Text: w.Text,
    ShadowRoot: w.ShadowRoot,
    DocumentFragment: w.DocumentFragment,
    NodeFilter: w.NodeFilter,
    getComputedStyle: w.getComputedStyle,
    MutationObserver: w.MutationObserver,
  })) {
    (globalThis as Record<string, unknown>)[k] = v;
  }
}

/** Realistic imperfect-English comments in the style this product targets. */
const FIXTURE_COMMENTS = [
  'I am agree with you but I think there is some point that not correct.',
  'This is very useful for my work, I use it everyday and it save me lot of time.',
  'Can anyone tell me how does this thing work because I am new in this field.',
  'The article was good but writer could explain more about the second part of it.',
  'I don\x27t think this is true because I try it and it did not work for me.',
];

/** Best-effort real user-generated English from the Hacker News API. */
async function fetchHnCommentTexts(): Promise<string[]> {
  try {
    const top: number[] = await (
      await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
    ).json();
    const item: { kids?: number[] } = await (
      await fetch(`https://hacker-news.firebaseio.com/v0/item/${top[0]}.json`)
    ).json();
    if (!item.kids) return [];
    const kids = await Promise.all(
      item.kids.slice(0, 8).map((k) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${k}.json`).then((r) => r.json()),
      ),
    );
    return kids
      .filter((c) => c && c.type === 'comment' && typeof c.text === 'string')
      .map((c) => (c.text as string).replace(/<[^>]*>/g, '').replace(/&#x27;/g, "'").trim())
      .filter((t) => t.length >= 12)
      .slice(0, 4);
  } catch {
    return [];
  }
}

function buildDomFrom(comments: string[]): void {
  document.body.innerHTML = `
    <nav><a href="/">Home</a></nav>
    <button class="vote">Vote</button>
    <button class="reply">Reply</button>
    ${comments
      .map(
        (t, i) =>
          `<article><div class="Comment"><p data-idx="${i}">${t.replace(/</g, '&lt;')}</p></div></article>`,
      )
      .join('')}
  `;
}

describe.skipIf(!hasKey)('live end-to-end (real Gemini)', () => {
  let comments: string[];

  beforeAll(async () => {
    installDom();
    mocks.storageGet.mockImplementation(async () => ({ [STORAGE_KEY]: apiKey }));
    // The content script's sendMessage is wired to the REAL llmClient.transform,
    // which makes a genuine call to the Gemini API.
    mocks.sendMessage.mockImplementation(async (msg: { texts: string[] }) => {
      const results = await transform(msg.texts);
      return { type: 'transform-text-result', results, notConfigured: !apiKey };
    });
    const real = await fetchHnCommentTexts();
    comments = [...FIXTURE_COMMENTS, ...real];
  });

  it('rewrites imperfect user English into natural English and leaves UI untouched', async () => {
    buildDomFrom(comments);

    const result = await polishContent('example.com');

    expect(result.requested).toBe(comments.length);
    expect(result.applied).toBeGreaterThan(0);
    expect(result.notConfigured).toBe(false);

    // No Phase-1 placeholder marker leaked in.
    expect(document.body.innerHTML).not.toContain('[text-polisher]');

    // UI/navigation/buttons are byte-for-byte untouched.
    expect(document.querySelector('nav')?.textContent).toContain('Home');
    expect(document.querySelector('button.vote')?.textContent).toBe('Vote');
    expect(document.querySelector('button.reply')?.textContent).toBe('Reply');

    // At least the imperfect fixtures actually changed (natural rewrite happened).
    const rewritten = [...document.querySelectorAll('article .Comment p')].map(
      (el) => el.textContent ?? '',
    );
    for (let i = 0; i < FIXTURE_COMMENTS.length; i++) {
      expect(rewritten[i]).not.toBe(FIXTURE_COMMENTS[i]);
    }

    // Roots were marked processed for idempotency.
    for (const article of document.querySelectorAll('article')) {
      expect(article.getAttribute('data-text-polished')).toBe('true');
    }

    // Live evidence: print the before → after rewrites.
    console.log('\n=== LIVE REWRITES (real Gemini) ===');
    const pairs = [...document.querySelectorAll('article .Comment p')].map(
      (el) => el.textContent ?? '',
    );
    rewritten.forEach((after, i) => {
      const before = i < comments.length ? comments[i] : undefined;
      if (before !== undefined) console.log(`\n${i + 1}) BEFORE: ${before}\n   AFTER : ${after}`);
    });
    void pairs;
  });

  it('does not double-transform when apply runs a second time', async () => {
    buildDomFrom(comments);
    const first = await polishContent('example.com');
    expect(first.applied).toBeGreaterThan(0);
    const snapshot = document.body.innerHTML;

    const second = await polishContent('example.com');
    expect(second.requested).toBe(0);
    expect(second.applied).toBe(0);
    expect(document.body.innerHTML).toBe(snapshot);
  });
});
