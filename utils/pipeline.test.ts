// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PolishPipeline } from './pipeline';
import { findUserContentRoots } from './contentDetector';
import { PROCESSED_ATTR } from './polish';
import { MUTATION_SCAN_DELAY_MS, MUTATION_SCAN_BACKOFF_MAX_MS } from './settings';

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock('wxt/browser', () => ({
  browser: { runtime: { sendMessage: mocks.sendMessage } },
}));

// Wrap detection so tests can assert how many re-detection walks a scan runs.
vi.mock('./contentDetector', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./contentDetector')>();
  return { ...actual, findUserContentRoots: vi.fn(actual.findUserContentRoots) };
});

const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The active pipeline under test; stopped in afterEach so observers/listeners tear down. */
let pipe: PolishPipeline | null = null;

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
  vi.mocked(findUserContentRoots).mockClear();
  mocks.sendMessage.mockImplementation(async (msg: { texts: string[] }) => ({
    type: 'transform-text-result',
    results: msg.texts.map((t) => ({ ok: true, text: `P::${t.slice(0, 6)}` })),
    notConfigured: false,
  }));
});

afterEach(() => {
  pipe?.stop();
  pipe = null;
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

    pipe = new PolishPipeline('example.com');
    const result = await pipe.start();
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
    pipe = new PolishPipeline('example.com');
    await pipe.start(); // only a processed
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
    pipe = new PolishPipeline('example.com');
    await pipe.start();
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

  it('scans a shared parent once when a batch of siblings is added at once', async () => {
    body();
    setupRects({ a: { top: 0, bottom: 100 } }); // everything in view
    pipe = new PolishPipeline('example.com');
    await pipe.start();
    vi.mocked(findUserContentRoots).mockClear();

    for (let i = 0; i < 10; i++) {
      const el = document.createElement('article');
      el.dataset.id = `batch-${i}`;
      el.innerHTML = '<p>brand new batch comment that is long enough to detect here</p>';
      document.body.appendChild(el);
    }

    await vi.waitFor(
      () => expect(document.querySelector('[data-id="batch-9"]')?.hasAttribute(PROCESSED_ATTR)).toBe(true),
      { timeout: 3000 },
    );
    // All 10 siblings share one parent, so one detection walk must cover them.
    expect(vi.mocked(findUserContentRoots)).toHaveBeenCalledTimes(1);
  });

  it('grows the scan backoff even while new content keeps being found', async () => {
    body();
    setupRects({ a: { top: 0, bottom: 100 } });
    pipe = new PolishPipeline('example.com');
    await pipe.start();
    expect(pipe.scanDelay).toBe(MUTATION_SCAN_DELAY_MS);

    const el = document.createElement('article');
    el.dataset.id = 'grow';
    el.innerHTML = '<p>another freshly mounted comment that is long enough to detect</p>';
    document.body.appendChild(el);

    // The first scan finds the new root but still backs off (no scroll reset),
    // so an unattended live tab settles instead of scanning every 250ms.
    await vi.waitFor(() => expect(pipe!.scanDelay).toBeGreaterThan(MUTATION_SCAN_DELAY_MS), { timeout: 3000 });
    expect(pipe!.scanDelay).toBeLessThanOrEqual(MUTATION_SCAN_BACKOFF_MAX_MS);
  });

  it('defers mutation re-detection while the user is scrolling', async () => {
    body();
    setupRects({ a: { top: 0, bottom: 100 } });
    pipe = new PolishPipeline('example.com');
    await pipe.start();

    window.dispatchEvent(new Event('scroll')); // scroll-pause window opens
    const el = document.createElement('article');
    el.dataset.id = 'd';
    el.innerHTML = '<p>brand new comment added during scroll that is long enough</p>';
    document.body.appendChild(el);

    // Within the scroll-pause window the new node must not be detected.
    await tick(60);
    expect(document.querySelector('[data-id="d"]')?.hasAttribute(PROCESSED_ATTR)).toBe(false);

    // Once the scroll settles, the debounced scan picks it up.
    await vi.waitFor(
      () => expect(document.querySelector('[data-id="d"]')?.hasAttribute(PROCESSED_ATTR)).toBe(true),
      { timeout: 3000 },
    );
  });

  it('pauses queued work on demand and resumes from where it left off', async () => {
    body();
    setupRects({
      a: { top: 0, bottom: 100 },
      b: { top: 5000, bottom: 5100 },
      c: { top: 6000, bottom: 6100 },
    });
    pipe = new PolishPipeline('example.com');
    await pipe.start(); // a processed, b+c observed
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

    // Pause, then bring B into view — it must not be sent to the API.
    pipe.pause();
    FakeIO.instances[0]!.fire(document.querySelector('[data-id="b"]') as Element);
    await tick(80);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

    // Resume: queued work continues from where it paused.
    pipe.resume();
    await vi.waitFor(() => expect(mocks.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2), {
      timeout: 3000,
    });
    expect(document.querySelector('[data-id="b"]')?.hasAttribute(PROCESSED_ATTR)).toBe(true);
    expect(document.querySelector('[data-id="c"]')?.hasAttribute(PROCESSED_ATTR)).toBe(false);
  });

  it('reports running → paused → running via the status callback', async () => {
    body();
    setupRects({
      a: { top: 0, bottom: 100 },
      b: { top: 5000, bottom: 5100 },
      c: { top: 6000, bottom: 6100 },
    });
    const statuses: string[] = [];
    pipe = new PolishPipeline('example.com', (s) => statuses.push(s));
    await pipe.start();
    expect(pipe.state).toBe('running'); // b,c still observed off-screen
    pipe.pause();
    expect(pipe.state).toBe('paused');
    pipe.resume();
    expect(pipe.state).toBe('running');
    expect(statuses).toContain('running');
    expect(statuses).toContain('paused');
  });

  it('reports done when all content has been processed', async () => {
    body();
    setupRects({ a: { top: 0, bottom: 100 } }); // everything is in view
    const statuses: string[] = [];
    pipe = new PolishPipeline('example.com', (s) => statuses.push(s));
    await pipe.start();
    expect(pipe.state).toBe('done');
    expect(statuses).toContain('done');
  });

  it('falls back to a single full pass when IntersectionObserver is unavailable', async () => {
    delete (globalThis as Record<string, unknown>).IntersectionObserver;
    body();
    pipe = new PolishPipeline('example.com');
    const result = await pipe.start();
    expect(result.applied).toBe(3);
    expect(result.pending).toBe(0);
  });

  it('reports per-root progress through the onProgress callback', async () => {
    body();
    setupRects({ a: { top: 0, bottom: 100 }, b: { top: 0, bottom: 100 }, c: { top: 0, bottom: 100 } });
    const progress: number[] = [];
    pipe = new PolishPipeline('example.com', undefined, (n) => progress.push(n));
    await pipe.start();
    expect(progress).toEqual([1, 2, 3]);
  });

  it('exposes applied rewrites with originals for session undo', async () => {
    body();
    setupRects({ a: { top: 0, bottom: 100 }, b: { top: 5000, bottom: 5100 }, c: { top: 6000, bottom: 6100 } });
    pipe = new PolishPipeline('example.com');
    await pipe.start();
    expect(pipe.appliedCount).toBe(1);
    expect(pipe.undoRecords).toHaveLength(1);
    expect(pipe.undoRecords[0]!.original).toContain('first comment body');
    expect(pipe.undoRecords[0]!.node.textContent).toContain('P::first');
  });

  it('is a no-op when there is no body', async () => {
    const body = document.body;
    body.remove();
    pipe = new PolishPipeline('example.com');
    const result = await pipe.start();
    expect(result.applied).toBe(0);
    expect(result.requested).toBe(0);
    document.documentElement.append(body);
  });
});
