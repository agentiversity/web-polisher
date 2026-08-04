// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { polishContent, collectEligibleTextNodes, isMeaningfullyChanged } from './polish';
import { PROCESSED_ATTR } from './textReplacer';
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
});

describe('polishContent', () => {
  it('applies successful results back to the same text nodes and marks roots', async () => {
    setupArticles();
    mocks.sendMessage.mockResolvedValue(
      replyFor([
        { ok: true, text: 'POLISHED ONE' },
        { ok: true, text: 'POLISHED TWO' },
      ]),
    );

    const result = await polishContent('example.com');
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

  it('is a graceful no-op and marks nothing when not configured', async () => {
    setupArticles();
    mocks.sendMessage.mockResolvedValue(replyFor([], true));

    const result = await polishContent('example.com');
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

    const result = await polishContent('example.com');
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

    const first = await polishContent('example.com');
    expect(first.applied).toBe(2);

    // Second click: roots are now marked; nothing is collected or sent.
    mocks.sendMessage.mockClear();
    const second = await polishContent('example.com');
    expect(second.requested).toBe(0);
    expect(second.applied).toBe(0);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps the original when a result equals the existing text (no improvement)', async () => {
    setupArticles();
    mocks.sendMessage.mockResolvedValue(
      replyFor([
        { ok: true, text: 'this is a user comment that is long enough to transform' },
        { ok: true, text: 'another comment body that should also be handled fine here' },
      ]),
    );
    const result = await polishContent('example.com');
    // No textual change, so not counted as applied (and nothing to write).
    expect(result.applied).toBe(0);
    expect(document.body.textContent).toContain('this is a user comment');
  });

  it('does nothing when there is no body', async () => {
    // jsdom document has a body; simulate none by detaching it for this call.
    const body = document.body;
    body.remove();
    const result = await polishContent('example.com');
    expect(result.applied).toBe(0);
    expect(result.requested).toBe(0);
    // Restore for later tests.
    document.documentElement.append(body);
  });
});

describe('edge cases', () => {
  it('handles sendMessage throwing an error gracefully', async () => {
    setupArticles();
    mocks.sendMessage.mockRejectedValue(new Error('context invalidated'));

    const result = await polishContent('example.com');
    // Should degrade gracefully — no crash, no applied rewrites.
    expect(result.applied).toBe(0);
    expect(result.notConfigured).toBe(false);
    expect(document.body.textContent).toContain('this is a user comment');
  });

  it('skips detached nodes (node.isConnected === false) in results', async () => {
    setupArticles();
    const firstP = document.querySelector('article p') as HTMLParagraphElement;

    mocks.sendMessage.mockImplementation(async () => {
      // Simulate the node being removed from DOM while awaiting the API response.
      firstP.remove();
      return replyFor([{ ok: true, text: 'SHOULD NOT APPLY' }]);
    });

    const result = await polishContent('example.com');
    expect(result.applied).toBe(0);
    // Original text is gone (element removed), but the rewrite was not applied.
    expect(document.body.textContent).not.toContain('SHOULD NOT APPLY');
  });

  it('skips results when reply.results is shorter than nodes array', async () => {
    setupArticles();
    // Return fewer results than nodes — should not crash.
    mocks.sendMessage.mockResolvedValue(replyFor([{ ok: true, text: 'ONLY ONE' }]));

    const result = await polishContent('example.com');
    // 2 nodes collected but only 1 result — should apply at most 1.
    expect(result.applied).toBeLessThanOrEqual(1);
  });

  it('handles null result items gracefully', async () => {
    setupArticles();
    mocks.sendMessage.mockResolvedValue({
      type: 'transform-text-result',
      results: [null as unknown as { ok: boolean; text: string }, { ok: true, text: 'VALID' }],
      notConfigured: false,
    });

    const result = await polishContent('example.com');
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
  it('flags real rewording as changed', () => {
    expect(isMeaningfullyChanged('I am very agree', 'I completely agree')).toBe(true);
  });
});
