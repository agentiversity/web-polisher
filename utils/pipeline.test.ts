// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startPolish, stopPolish } from './pipeline';
import { PROCESSED_ATTR } from './textReplacer';

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock('wxt/browser', () => ({
  browser: { runtime: { sendMessage: mocks.sendMessage } },
}));

const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Minimal IntersectionObserver stand-in so tests can drive intersections. */
type IOEntry = { target: Element; isIntersecting: boolean };
class FakeIO {
  static instances: FakeIO[] = [];
  private cb: (entries: IOEntry[], observer: unknown) => void;
  targets = new Set<Element>();
  constructor(cb: (entries: IOEntry[], observer: unknown) => void, _opts?: IntersectionObserverInit) {
    this.cb = cb;
    FakeIO.instances.push(this);
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    FakeIO.instances = FakeIO.instances.filter((i) => i !== this);
  }
  fire(el: Element) {
    this.cb([{ target: el, isIntersecting: true }], this);
  }
}

const realRect = Element.prototype.getBoundingClientRect;

/** Position articles by `data-id`; any element without a rect entry reads 0. */
function setupRects(rects: Record<string, { top: number; bottom: number }>): void {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const r = rects[this.getAttribute('data-id') ?? ''];
    if (r) {
      return {
        top: r.top,
        bottom: r.bottom,
        left: 0,
        right: 0,
        width: 0,
        height: r.bottom - r.top,
        x: 0,
        y: r.top,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
}

function body(): void {
  document.body.innerHTML =
    '<article data-id="a"><p>first comment body that is long enough to transform</p></article>' +
    '<article data-id="b"><p>second comment body that is also long enough to transform</p></article>' +
    '<article data-id="c"><p>third comment body that is definitely long enough here</p></article>';
}

beforeEach(() => {
  document.body.innerHTML = '';
  FakeIO.instances = [];
  (globalThis as Record<string, unknown>).IntersectionObserver = FakeIO;
  mocks.sendMessage.mockReset();
  mocks.sendMessage.mockImplementation(async (msg: { texts: string[] }) => ({
    type: 'transform-text-result',
    results: msg.texts.map((t) => ({ ok: true, text: `P::${t.slice(0, 6)}` })),
    notConfigured: false,
  }));
});

afterEach(() => {
  stopPolish();
  delete (globalThis as Record<string, unknown>).IntersectionObserver;
  Element.prototype.getBoundingClientRect = realRect;
});

describe('PolishPipeline', () => {
  it('processes in-view roots first and defers off-screen roots to the observer', async () => {
    body();
    setupRects({
      a: { top: 0, bottom: 100 },
      b: { top: 5000, bottom: 5100 },
      c: { top: 6000, bottom: 6100 },
    });

    const result = await startPolish('example.com');
    expect(result.applied).toBe(1);
    expect(result.pending).toBe(2);

    // In-view root transformed; off-screen roots untouched.
    expect(document.querySelector('[data-id="a"]')?.textContent).toContain('P::first');
    expect(document.querySelector('[data-id="b"]')?.textContent).toContain('second comment body');
    expect(document.querySelector('[data-id="a"]')?.hasAttribute(PROCESSED_ATTR)).toBe(true);
    expect(document.querySelector('[data-id="b"]')?.hasAttribute(PROCESSED_ATTR)).toBe(false);

    // User scrolls near B → observer fires → B is processed.
    FakeIO.instances[0]!.fire(document.querySelector('[data-id="b"]') as Element);
    await vi.waitFor(
      () => expect(document.querySelector('[data-id="b"]')?.textContent).toContain('P::second'),
      { timeout: 2000 },
    );
    expect(document.querySelector('[data-id="b"]')?.hasAttribute(PROCESSED_ATTR)).toBe(true);
    // C is still deferred.
    expect(document.querySelector('[data-id="c"]')?.hasAttribute(PROCESSED_ATTR)).toBe(false);
  });

  it('pauses queued work while the user is scrolling', async () => {
    body();
    setupRects({
      a: { top: 0, bottom: 100 },
      b: { top: 5000, bottom: 5100 },
      c: { top: 6000, bottom: 6100 },
    });
    await startPolish('example.com'); // only a processed
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('scroll'));
    FakeIO.instances[0]!.fire(document.querySelector('[data-id="b"]') as Element);

    // Still within the scroll pause window: b must not be sent to the API.
    await tick(60);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

    // Once the scroll settles, queued work resumes.
    await vi.waitFor(() => expect(mocks.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2), {
      timeout: 3000,
    });
    expect(document.querySelector('[data-id="b"]')?.hasAttribute(PROCESSED_ATTR)).toBe(true);
  });

  it('picks up content mounted after the trigger (MutationObserver)', async () => {
    body();
    setupRects({ a: { top: 0, bottom: 100 } }); // b and c default to in-view
    await startPolish('example.com');
    expect(document.querySelector('[data-id="c"]')?.hasAttribute(PROCESSED_ATTR)).toBe(true);

    const el = document.createElement('article');
    el.dataset.id = 'd';
    el.innerHTML = '<p>brand new comment added after the click that is long enough</p>';
    document.body.appendChild(el);

    await vi.waitFor(
      () => expect(document.querySelector('[data-id="d"]')?.hasAttribute(PROCESSED_ATTR)).toBe(true),
      { timeout: 2000 },
    );
    expect(document.querySelector('[data-id="d"]')?.textContent).toContain('P::brand');
  });

  it('falls back to a single full pass when IntersectionObserver is unavailable', async () => {
    delete (globalThis as Record<string, unknown>).IntersectionObserver;
    body();
    const result = await startPolish('example.com');
    expect(result.applied).toBe(3);
    expect(result.pending).toBe(0);
  });
});
