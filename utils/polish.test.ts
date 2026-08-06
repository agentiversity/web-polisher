// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { polishRoots, collectEligibleTextNodes, isMeaningfullyChanged, PENDING_CLASS, PROCESSED_ATTR, markProcessed } from './polish';
import { findUserContentRoots } from './contentDetector';
import { MIN_TEXT_LENGTH } from './settings';
const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: { runtime: { sendMessage: mocks.sendMessage } },
}));

/** Build a DOM with a couple of `<article>` user-content blocks. */
function setupArticles(): void {
  document.body.innerHTML =
    '<article><p>this is a user comment that is long enough to transform</p></article>' +
    '<article><p>another comment body that should also be handled fine here</p></article>';
}

function replyFor(results: { ok: boolean; text: string }[], notConfigured = false) {
  return { type: 'transform-text-result', results, notConfigured };
}

/** Detect the page's user-content roots and polish them in one pass. */
function polishPage(): Promise<Awaited<ReturnType<typeof polishRoots>>> {
  return polishRoots(findUserContentRoots(document.body, 'example.com'), 'example.com');
}

beforeEach(() => {
  document.body.innerHTML = '';
  mocks.sendMessage.mockReset();
});

describe('collectEligibleTextNodes', () => {
  it('collects visible non-UI text nodes above the minimum length', () => {
    setupArticles();
    const root = document.querySelector('article') as HTMLElement;
    const nodes = collectEligibleTextNodes(root);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.textContent).toContain('this is a user comment');
  });

  it('excludes short text below the minimum length', () => {
    document.body.innerHTML = '<article><p>hi</p><p>a sufficiently long comment text here</p></article>';
    const root = document.querySelector('article') as HTMLElement;
    const nodes = collectEligibleTextNodes(root);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.textContent).toBe('a sufficiently long comment text here');
  });

  it('excludes text in UI/interactive containers even at length', () => {
    document.body.innerHTML =
      '<article><button>Post Comment Now Button</button><p>real comment body text here</p></article>';
    const root = document.querySelector('article') as HTMLElement;
    const nodes = collectEligibleTextNodes(root);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.textContent).toBe('real comment body text here');
  });

  it('never collects text inside non-rendered containers (script/style/noscript)', () => {
    document.body.innerHTML =
      '<article>' +
      '<script>const longNonUserText = "nested helper text that is long enough here";</script>' +
      '<style>.longNonUserText{font-family:"not really user content anyway"}</style>' +
      '<noscript>this fallback text is long enough to count but must not be collected</noscript>' +
      '<p>real comment body text here</p></article>';
    const root = document.querySelector('article') as HTMLElement;
    const nodes = collectEligibleTextNodes(root);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.textContent).toBe('real comment body text here');
  });
});

describe('polishRoots', () => {
  it('applies successful results back to the same text nodes and marks roots', async () => {
    setupArticles();
    mocks.sendMessage.mockImplementation(async (msg: { texts: string[] }) =>
      replyFor(
        msg.texts.map((t) => ({
          ok: true,
          text: t.startsWith('this is a user comment') ? 'POLISHED ONE' : 'POLISHED TWO',
        })),
      ),
    );

    const result = await polishPage();
    expect(result.requested).toBe(2);
    expect(result.applied).toBe(2);
    expect(result.notConfigured).toBe(false);
    expect(document.body.textContent).toContain('POLISHED ONE');
    expect(document.body.textContent).toContain('POLISHED TWO');

    // Both article roots are marked processed for idempotency.
    for (const article of document.querySelectorAll('article')) {
      expect(article.hasAttribute(PROCESSED_ATTR)).toBe(true);
    }
  });

  it('exposes the confidence score on the highlighted parent and in the tooltip', async () => {
    setupArticles();
    mocks.sendMessage.mockImplementation(async (msg: { texts: string[] }) =>
      replyFor(
        msg.texts.map((t) => ({
          ok: true,
          text: t.startsWith('this is a user comment') ? 'A clearly rewritten comment here' : 'A clearly rewritten comment there',
          confidence: t.startsWith('this is a user comment') ? 91 : 88,
        })),
      ),
    );

    const result = await polishPage();
    expect(result.applied).toBe(2);
    const highlighted = [...document.querySelectorAll<HTMLElement>('.text-polished')];
    expect(highlighted).toHaveLength(2);
    expect(highlighted.map((s) => s.dataset.confidence)).toEqual(['91', '88']);
    expect(highlighted[0]!.title).toContain('Confidence: 91');
    expect(highlighted[0]!.title).toContain('this is a user comment that is long enough to transform');
  });

  it('marks a block as pending while the rewrite is in flight and clears it after', async () => {
    document.body.innerHTML = '<article><p>a single comment text that is long enough to transform here</p></article>';
    let resolveSend!: (r: unknown) => void;
    mocks.sendMessage.mockImplementation(() => new Promise((resolve) => { resolveSend = resolve; }));

    const promise = polishPage();
    // While the LLM call is in flight, the block carries the pending animation.
    await vi.waitFor(
      () => expect(document.querySelector('article p')?.classList.contains(PENDING_CLASS)).toBe(true),
      { timeout: 2000 },
    );
    resolveSend!(replyFor([{ ok: true, text: 'A clearly rewritten version here' }]));
    await promise;

    const p = document.querySelector('article p') as HTMLElement;
    expect(p.classList.contains(PENDING_CLASS)).toBe(false);
    expect(p.classList.contains('text-polished')).toBe(true);
  });

  it('clears the pending state and keeps the original when the text is unchanged', async () => {
    document.body.innerHTML = '<article><p>This sentence is already completely natural English text here.</p></article>';
    mocks.sendMessage.mockResolvedValue(replyFor([{ ok: true, text: 'This sentence is already completely natural English text here.' }]));

    const result = await polishPage();
    expect(result.applied).toBe(0);
    const p = document.querySelector('article p') as HTMLElement;
    expect(p.classList.contains(PENDING_CLASS)).toBe(false);
    expect(p.classList.contains('text-polished')).toBe(false);
  });

  it('is a graceful no-op and marks nothing when not configured', async () => {
    setupArticles();
    mocks.sendMessage.mockResolvedValue(replyFor([], true));

    const result = await polishPage();
    expect(result.notConfigured).toBe(true);
    expect(result.applied).toBe(0);
    expect(document.body.textContent).toContain('this is a user comment');
    for (const article of document.querySelectorAll('article')) {
      expect(article.hasAttribute(PROCESSED_ATTR)).toBe(false);
    }
  });

  it('keeps originals and marks nothing when all results fail', async () => {
    setupArticles();
    mocks.sendMessage.mockResolvedValue(
      replyFor([
        { ok: false, text: '' },
        { ok: false, text: '' },
      ]),
    );

    const result = await polishPage();
    expect(result.applied).toBe(0);
    expect(document.body.textContent).toContain('this is a user comment');
    expect(document.querySelectorAll('article')[0]!.hasAttribute(PROCESSED_ATTR)).toBe(false);
  });

  it('does not re-transform a root already marked processed on a second click', async () => {
    setupArticles();
    mocks.sendMessage.mockResolvedValue(
      replyFor([
        { ok: true, text: 'POLISHED ONE' },
        { ok: true, text: 'POLISHED TWO' },
      ]),
    );

    const first = await polishPage();
    expect(first.applied).toBe(2);

    // Second click: roots are now marked; nothing is collected or sent.
    mocks.sendMessage.mockClear();
    const second = await polishPage();
    expect(second.requested).toBe(0);
    expect(second.applied).toBe(0);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps the original when a result equals the existing text (no improvement)', async () => {
    setupArticles();
    // Model returns every item verbatim — no rewrite worth applying.
    mocks.sendMessage.mockImplementation(async (msg: { texts: string[] }) =>
      replyFor(msg.texts.map((t) => ({ ok: true, text: t }))),
    );
    const result = await polishPage();
    // No textual change, so not counted as applied (and nothing to write).
    expect(result.applied).toBe(0);
    expect(document.body.textContent).toContain('this is a user comment');
  });
});

describe('polishRoots (per-root path)', () => {
  it('polishes a single root and marks only it processed', async () => {
    setupArticles();
    mocks.sendMessage.mockResolvedValue(replyFor([{ ok: true, text: 'POLISHED ONE' }]));

    const root = document.querySelector('article') as HTMLElement;
    const r = await polishRoots([root], 'example.com');
    expect(r.requested).toBe(1);
    expect(r.applied).toBe(1);
    expect(r.notConfigured).toBe(false);
    expect(root.hasAttribute(PROCESSED_ATTR)).toBe(true);
    expect(document.querySelectorAll('article')[1]!.hasAttribute(PROCESSED_ATTR)).toBe(false);
  });

  it('is a no-op for a root already processed', async () => {
    setupArticles();
    const root = document.querySelector('article') as HTMLElement;
    markProcessed(root);

    const r = await polishRoots([root], 'example.com');
    expect(r.requested).toBe(0);
    expect(r.applied).toBe(0);
    expect(r.notConfigured).toBe(false);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('returns notConfigured and leaves the root unmarked when no key is set', async () => {
    setupArticles();
    mocks.sendMessage.mockResolvedValue(replyFor([], true));

    const root = document.querySelector('article') as HTMLElement;
    const r = await polishRoots([root], 'example.com');
    expect(r.requested).toBe(1);
    expect(r.applied).toBe(0);
    expect(r.notConfigured).toBe(true);
    expect(root.hasAttribute(PROCESSED_ATTR)).toBe(false);
  });

  it('records applied rewrites with their originals for session undo', async () => {
    setupArticles();
    mocks.sendMessage.mockImplementation(async (msg: { texts: string[] }) =>
      replyFor(
        msg.texts.map((t) => ({ ok: true, text: t.startsWith('this is a user comment') ? 'POLISHED ONE' : 'POLISHED TWO' })),
      ),
    );
    const result = await polishRoots(findUserContentRoots(document.body, 'example.com'), 'example.com');
    expect(result.applied).toBe(2);
    expect(result.rewrites).toHaveLength(2);
    expect(result.rewrites[0]!.original).toBe('this is a user comment that is long enough to transform');
    expect(result.rewrites[0]!.node.textContent).toBe('POLISHED ONE');
  });

  it('breaks down per-item failure kinds in errors', async () => {
    setupArticles();
    mocks.sendMessage.mockResolvedValue({
      type: 'transform-text-result',
      results: [
        { ok: false, text: '', error: 'network' },
        { ok: false, text: '', error: 'low-confidence' },
      ],
      notConfigured: false,
    });
    const result = await polishRoots(findUserContentRoots(document.body, 'example.com'), 'example.com');
    expect(result.applied).toBe(0);
    expect(result.errors).toEqual({ network: 1, 'low-confidence': 1 });
  });
});

describe('edge cases', () => {
  it('handles sendMessage throwing an error gracefully', async () => {
    setupArticles();
    mocks.sendMessage.mockRejectedValue(new Error('context invalidated'));

    const result = await polishPage();
    // Should degrade gracefully — no crash, no applied rewrites.
    expect(result.applied).toBe(0);
    expect(result.notConfigured).toBe(false);
    expect(document.body.textContent).toContain('this is a user comment');
  });

  it('skips detached nodes (node.isConnected === false) in results', async () => {
    setupArticles();
    const firstP = document.querySelector('article p') as HTMLParagraphElement;

    mocks.sendMessage.mockImplementation(async (msg: { texts: string[] }) => {
      // Detach the first article's node while awaiting the response; the second
      // article's text transforms normally.
      if (msg.texts.some((t) => t.includes('this is a user comment'))) firstP.remove();
      return replyFor(
        msg.texts.map((t) => ({
          ok: true,
          text: t.includes('this is a user comment') ? 'SHOULD NOT APPLY' : 'SECOND APPLIED',
        })),
      );
    });

    const result = await polishPage();
    // Detached node's rewrite is not applied; the other root still is.
    expect(result.applied).toBe(1);
    expect(document.body.textContent).not.toContain('SHOULD NOT APPLY');
    expect(document.body.textContent).toContain('SECOND APPLIED');
  });

  it('applies at most the number of results returned', async () => {
    document.body.innerHTML =
      '<article><p>first comment text that is long enough to transform</p>' +
      '<p>second comment text that is also long enough to transform</p></article>';
    // Each node is its own batch (BATCH_SIZE 1); a reply with no results for a
    // node means nothing is applied — nothing crashes.
    mocks.sendMessage.mockResolvedValue(replyFor([]));

    const result = await polishPage();
    expect(result.applied).toBe(0);
    expect(document.body.textContent).not.toContain('ONLY ONE');
  });

  it('handles null result items gracefully', async () => {
    setupArticles();
    mocks.sendMessage.mockResolvedValue({
      type: 'transform-text-result',
      results: [null as unknown as { ok: boolean; text: string }, { ok: true, text: 'VALID' }],
      notConfigured: false,
    });

    const result = await polishPage();
    // null result should be skipped, valid result applied if meaningfully changed.
    expect(result.applied).toBeLessThanOrEqual(1);
  });
});

describe('MIN_TEXT_LENGTH default', () => {
  it('is a sane positive default used by collection', () => {
    expect(MIN_TEXT_LENGTH).toBeGreaterThan(0);
  });
});

describe('isMeaningfullyChanged', () => {
  it('treats identical text as unchanged', () => {
    expect(isMeaningfullyChanged('This is fine.', 'This is fine.')).toBe(false);
  });
  it('treats whitespace-only differences as unchanged (no highlight)', () => {
    expect(isMeaningfullyChanged('I  am   here', 'I am here')).toBe(false);
    expect(isMeaningfullyChanged(' leading', 'leading')).toBe(false);
  });
  it('treats case-only differences as unchanged', () => {
    expect(isMeaningfullyChanged('i am here', 'I am here')).toBe(false);
  });
  it('treats punctuation-only differences as unchanged (no highlight)', () => {
    expect(isMeaningfullyChanged('That was a really good movie, I enjoyed it.', 'That was a really good movie; I enjoyed it.')).toBe(false);
    expect(isMeaningfullyChanged('I like it — really.', 'I like it, really.')).toBe(false);
  });
  it('flags real rewording as changed', () => {
    expect(isMeaningfullyChanged('I am very agree', 'I completely agree')).toBe(true);
  });
});
