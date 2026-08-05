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
import { MIN_TEXT_LENGTH, MUTATION_SCAN_BACKOFF_MAX_MS, MUTATION_SCAN_DELAY_MS, SCROLL_PAUSE_MS, VIEWPORT_MARGIN_PX } from './settings';

const EMPTY: PolishResult = { requested: 0, applied: 0, blocks: 0, pending: 0, notConfigured: false };

/** Lifecycle status surfaced to the UI (toolbar icon). */
export type PipelineStatus = 'idle' | 'running' | 'paused' | 'done';

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
  private paused = false;
  private inFlight = 0;
  private status: PipelineStatus = 'idle';
  private readonly statusCallback?: (status: PipelineStatus) => void;

  constructor(hostname: string, statusCallback?: (status: PipelineStatus) => void) {
    this.hostname = hostname;
    this.statusCallback = statusCallback;
  }

  get state(): PipelineStatus {
    return this.status;
  }

  private setState(s: PipelineStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.statusCallback?.(s);
  }

  /** Recompute the lifecycle status from the current flags/queues. */
  private recomputeStatus(): void {
    if (this.stopped) return this.setState('idle');
    if (this.paused) return this.setState('paused');
    if (this.inFlight > 0 || this.roots.size > 0 || this.queued.size > 0) return this.setState('running');
    return this.setState('done');
  }

  /** Pause processing: queued/observed work waits until `resume()`. */
  pause(): void {
    if (this.stopped || this.paused) return;
    this.paused = true;
    this.recomputeStatus();
  }

  /** Resume processing from where it paused. */
  resume(): void {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    this.recomputeStatus();
  }

  /**
   * Run the initial pass and arm the observers. Resolves with the initial-pass
   * stats; scroll-driven work continues in the background afterwards.
   */
  async start(): Promise<PolishResult> {
    if (!document.body) return EMPTY;
    this.setState('running');
    const all = findUserContentRoots(document.body, this.hostname);
    if (all.length === 0) {
      this.recomputeStatus();
      return EMPTY;
    }
    this.wireScroll();

    if (typeof IntersectionObserver === 'undefined') {
      // No IO (jsdom): single full pass, same as before Phase 4.
      for (const root of all) this.enqueue(root);
      await this.chain;
      this.recomputeStatus();
      return { ...this.stats, blocks: all.length, pending: 0 };
    }

    const near: Element[] = [];
    for (const root of all) {
      if (root.hasAttribute(PROCESSED_ATTR)) continue;
      if (this.isNearViewport(root)) near.push(root);
      else this.roots.add(root);
    }
    this.startObservers();
    // Initial pass goes through the serial chain (one root at a time) so a
    // pause/resume toggle can gate it; each root is processed independently.
    for (const root of near) this.enqueue(root);
    await this.chain;
    this.recomputeStatus();
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
    this.recomputeStatus();
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
  private scanBackoffMs = MUTATION_SCAN_DELAY_MS;

  private scheduleScan(): void {
    if (this.mutationTimer !== null || this.stopped) return;
    this.mutationTimer = setTimeout(() => {
      this.mutationTimer = null;
      if (this.stopped) return;
      // Detection reads layout (getBoundingClientRect/getComputedStyle), which
      // causes scroll jank, so defer it until the user stops scrolling, and
      // while the user has paused polishing. The debounce plus the
      // observer-side pre-filter keeps idle CPU near zero.
      if (this.scrollPaused || this.paused) {
        this.scheduleScan();
        return;
      }
      const found = this.scanForNewRoots();
      // Idle backoff: when scans keep finding nothing new, space them out (up to
      // a cap) so a churny page no longer costs sustained CPU — Firefox flags
      // extensions whose content scripts run continuously. Any discovery (or the
      // user scrolling, which usually precedes new content) resets the backoff.
      if (found) {
        this.scanBackoffMs = MUTATION_SCAN_DELAY_MS;
      } else {
        this.scanBackoffMs = Math.min(MUTATION_SCAN_BACKOFF_MAX_MS, this.scanBackoffMs * 2);
      }
    }, this.scanBackoffMs);
  }

  /**
   * Scan added subtrees for new user-content roots. Returns true when at least
   * one new root was registered (so the caller can reset the idle backoff).
   */
  private scanForNewRoots(): boolean {
    let found = false;
    const nodes = [...this.pendingNodes];
    this.pendingNodes.clear();
    for (const node of nodes) {
      if (this.stopped) return found;
      if (!node.isConnected) continue;
      const subRoot = node instanceof Element ? node : node.parentElement;
      if (!subRoot) continue;
      // Cheap pre-filter before running full detection heuristics.
      if (subRoot.closest(`[${PROCESSED_ATTR}]`)) continue;
      if ((subRoot.textContent ?? '').trim().length < MIN_TEXT_LENGTH) continue;
      // Scan the added node's parent so the added element itself can be detected
      // as a top-most content root (TreeWalker never yields the scan root).
      const scanRoot = subRoot.parentElement ?? subRoot;
      const before = this.roots.size;
      for (const foundEl of findUserContentRoots(scanRoot, this.hostname)) {
        this.registerRoot(foundEl);
      }
      if (this.roots.size > before) found = true;
    }
    return found;
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
    if (this.stopped || el.hasAttribute(PROCESSED_ATTR)) return;
    this.inFlight++;
    this.recomputeStatus();
    try {
      await this.waitWhilePaused();
      if (this.stopped || el.hasAttribute(PROCESSED_ATTR)) return;
      this.accumulate(await polishRoots([el], this.hostname));
    } finally {
      this.inFlight--;
      this.queued.delete(el);
      this.recomputeStatus();
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
    while ((this.scrollPaused || this.paused) && !this.stopped) {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  }

  private wireScroll(): void {
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  private readonly onScroll = (): void => {
    this.scrollPaused = true;
    // Scrolling usually precedes new content (infinite scroll), so the next
    // mutation scan should happen promptly rather than on a long idle backoff.
    this.scanBackoffMs = MUTATION_SCAN_DELAY_MS;
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

/** Pause the active pipeline (toggle): queued work waits until resume. */
export function pausePolish(): void {
  activePipeline?.pause();
}

/** Resume the active pipeline from where it paused. */
export function resumePolish(): void {
  activePipeline?.resume();
}

/** Current lifecycle status of the active pipeline (for the toolbar icon). */
export function currentPipelineState(): PipelineStatus {
  return activePipeline?.state ?? 'idle';
}
