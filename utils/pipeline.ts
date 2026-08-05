/**
 * Lazy, viewport-gated polish pipeline (Phase 4, design D1–D5).
 *
 * Runs after the user triggers polishing: user-content roots in/near the
 * viewport are processed immediately; the rest are observed with an
 * IntersectionObserver and processed as the user scrolls near them. A
 * MutationObserver re-detects dynamically mounted content (infinite scroll /
 * virtualization), and work pauses while the user is actively scrolling so the
 * page never janks (no DOM writes mid-scroll).
 *
 * When IntersectionObserver is unavailable (jsdom / unusual embedding) it falls
 * back to a single full pass, matching the pre-Phase-4 behavior.
 */
import { findUserContentRoots } from './contentDetector';
import { polishRoots, type PolishResult } from './polish';
import { PROCESSED_ATTR } from './textReplacer';
import { MIN_TEXT_LENGTH, MUTATION_SCAN_DELAY_MS, SCROLL_PAUSE_MS, VIEWPORT_MARGIN_PX } from './settings';

const EMPTY: PolishResult = { requested: 0, applied: 0, blocks: 0, pending: 0, notConfigured: false };

export class PolishPipeline {
  private readonly hostname: string;
  private io: IntersectionObserver | null = null;
  private mo: MutationObserver | null = null;
  /** Roots awaiting scroll-driven processing (observed, not yet queued). */
  private readonly roots = new Set<Element>();
  /** Roots currently queued for processing (dedupe guard). */
  private readonly queued = new Set<Element>();
  /** Serial processing chain — one root at a time, no concurrent batches. */
  private chain: Promise<void> = Promise.resolve();
  private readonly stats = { requested: 0, applied: 0, notConfigured: false };
  private scrollPaused = false;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private mutationTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingNodes = new Set<Node>();
  private stopped = false;

  constructor(hostname: string) {
    this.hostname = hostname;
  }

  /**
   * Run the initial pass and arm the observers. Resolves with the initial-pass
   * stats; scroll-driven work continues in the background afterwards.
   */
  async start(): Promise<PolishResult> {
    if (!document.body) return EMPTY;
    const all = findUserContentRoots(document.body, this.hostname);
    if (all.length === 0) return EMPTY;
    this.wireScroll();

    if (typeof IntersectionObserver === 'undefined') {
      // No IO (jsdom): single full pass, same as before Phase 4.
      for (const root of all) this.enqueue(root);
      await this.chain;
      return { ...this.stats, blocks: all.length, pending: 0 };
    }

    const near: Element[] = [];
    for (const root of all) {
      if (root.hasAttribute(PROCESSED_ATTR)) continue;
      if (this.isNearViewport(root)) near.push(root);
      else this.roots.add(root);
    }
    this.startObservers();
    // Batch the initial pass across all in-view roots (one LLM request, not one
    // per root) — bounded batches stay intact (design D2).
    const initial = await polishRoots(near, this.hostname);
    this.accumulate(initial);
    return { ...this.stats, blocks: all.length, pending: this.roots.size };
  }

  /** Tear down observers/listeners; queued work is cancelled. */
  stop(): void {
    this.stopped = true;
    this.io?.disconnect();
    this.io = null;
    this.mo?.disconnect();
    this.mo = null;
    if (this.scrollTimer !== null) clearTimeout(this.scrollTimer);
    if (this.mutationTimer !== null) clearTimeout(this.mutationTimer);
    window.removeEventListener('scroll', this.onScroll);
    if (activePipeline === this) activePipeline = null;
  }

  private isNearViewport(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    const margin = VIEWPORT_MARGIN_PX;
    const bottom = window.innerHeight || document.documentElement.clientHeight || 0;
    return rect.bottom >= -margin && rect.top <= bottom + margin;
  }

  private startObservers(): void {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as Element;
          if (this.roots.has(el)) {
            this.roots.delete(el);
            this.enqueue(el);
          }
        }
      },
      { rootMargin: `${VIEWPORT_MARGIN_PX}px 0px` },
    );
    for (const root of this.roots) io.observe(root);
    this.io = io;

    const mo = new MutationObserver((records) => {
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (!node.isConnected) continue;
          // Cheap ancestor walk (no layout reads): skip anything added inside
          // already-processed content — including our own rewrite spans — so
          // churny pages don't accumulate scan work.
          const el = node instanceof Element ? node : node.parentElement;
          if (el && el.closest(`[${PROCESSED_ATTR}]`)) continue;
          this.pendingNodes.add(node);
        }
      }
      this.scheduleScan();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    this.mo = mo;
  }

  /** Debounced re-detection pass; deferred while the user is actively scrolling. */
  private scheduleScan(): void {
    if (this.mutationTimer !== null || this.stopped) return;
    this.mutationTimer = setTimeout(() => {
      this.mutationTimer = null;
      if (this.stopped) return;
      // Detection reads layout (getBoundingClientRect/getComputedStyle), which
      // causes scroll jank, so defer it until the user stops scrolling. The
      // debounce plus the observer-side pre-filter keeps idle CPU near zero.
      if (this.scrollPaused) {
        this.scheduleScan();
        return;
      }
      this.scanForNewRoots();
    }, MUTATION_SCAN_DELAY_MS);
  }

  /** Debounced scan of added subtrees for new user-content roots. */
  private scanForNewRoots(): void {
    const nodes = [...this.pendingNodes];
    this.pendingNodes.clear();
    for (const node of nodes) {
      if (this.stopped) return;
      if (!node.isConnected) continue;
      const subRoot = node instanceof Element ? node : node.parentElement;
      if (!subRoot) continue;
      // Cheap pre-filter before running full detection heuristics.
      if (subRoot.closest(`[${PROCESSED_ATTR}]`)) continue;
      if ((subRoot.textContent ?? '').trim().length < MIN_TEXT_LENGTH) continue;
      // Scan the added node's parent so the added element itself can be detected
      // as a top-most content root (TreeWalker never yields the scan root).
      const scanRoot = subRoot.parentElement ?? subRoot;
      for (const found of findUserContentRoots(scanRoot, this.hostname)) {
        this.registerRoot(found);
      }
    }
  }

  private registerRoot(el: Element): void {
    if (this.stopped) return;
    if (el.hasAttribute(PROCESSED_ATTR)) return;
    if (el.closest(`[${PROCESSED_ATTR}]`)) return;
    for (const r of this.roots) {
      if (r.contains(el) || el.contains(r)) return;
    }
    if (this.io && this.isNearViewport(el)) {
      // Newly mounted content already in view: process now (matches the IO's
      // immediate callback for observed in-view elements).
      this.enqueue(el);
    } else {
      this.roots.add(el);
      this.io?.observe(el);
    }
  }

  private enqueue(el: Element): void {
    if (this.stopped || this.queued.has(el) || el.hasAttribute(PROCESSED_ATTR)) return;
    this.queued.add(el);
    this.roots.delete(el);
    this.chain = this.chain
      .then(() => this.processOne(el))
      .catch(() => {});
  }

  private async processOne(el: Element): Promise<void> {
    try {
      if (this.stopped || el.hasAttribute(PROCESSED_ATTR)) return;
      await this.waitWhilePaused();
      if (this.stopped || el.hasAttribute(PROCESSED_ATTR)) return;
      this.accumulate(await polishRoots([el], this.hostname));
    } finally {
      this.queued.delete(el);
    }
  }

  private accumulate(r: PolishResult): void {
    this.stats.requested += r.requested;
    this.stats.applied += r.applied;
    if (r.notConfigured) {
      this.stats.notConfigured = true;
      this.stop();
    }
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.scrollPaused && !this.stopped) {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  }

  private wireScroll(): void {
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  private readonly onScroll = (): void => {
    this.scrollPaused = true;
    if (this.scrollTimer !== null) clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      this.scrollPaused = false;
      this.scrollTimer = null;
    }, SCROLL_PAUSE_MS);
  };
}

let activePipeline: PolishPipeline | null = null;

/**
 * Start the lazy polish pipeline for a page. Resolves once the initial
 * viewport pass completes; scroll-driven and dynamic-content processing
 * continue in the background. Replaces any previously running pipeline.
 */
export async function startPolish(hostname: string): Promise<PolishResult> {
  activePipeline?.stop();
  const pipeline = new PolishPipeline(hostname);
  activePipeline = pipeline;
  return pipeline.start();
}

/** Tear down any running pipeline (e.g. page lifecycle reset). */
export function stopPolish(): void {
  activePipeline?.stop();
}
