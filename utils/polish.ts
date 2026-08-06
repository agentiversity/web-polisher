/**
 * Content-side orchestration (design D3).
 *
 * Runs existing content detection, collects eligible text nodes under the
 * detected roots, sends them in one `transform-text` message to the background
 * LLM client, then applies each successful result back to the SAME text node.
 *
 * React-safe and idempotent:
 * - Writes only to existing text nodes (never replaces whole elements).
 * - Before writing each result, re-verifies the node is still connected and its
 *   parent is not already marked processed (scroll/virtualization guard).
 * - On any failure / no-op it keeps the original text.
 */
import { browser } from 'wxt/browser';
import { findUserContentRoots, getSiteProfile, isExcluded, type SiteProfile } from './contentDetector';
import { walkTextNodesIncludingShadow } from './domWalk';
import { MIN_TEXT_LENGTH, MAX_TEXT_LENGTH, BATCH_SIZE } from './settings';
import type { TransformResult } from './llmClient';
import type { TransformTextMessage, TransformTextReply } from './messages';

/** In-DOM marker used to skip already-processed containers (idempotency). */
export const PROCESSED_ATTR = 'data-text-polished';

/** Mark a container as processed so later passes skip it. */
export function markProcessed(el: Element): void {
  el.setAttribute(PROCESSED_ATTR, 'true');
}

export interface PolishResult {
  /** Number of eligible text nodes collected. */
  requested: number;
  /** Number of text nodes actually rewritten. */
  applied: number;
  /** Number of detected content roots. */
  blocks: number;
  /** Number of content roots still waiting to be processed (Phase 4 lazy). */
  pending: number;
  /** True when the request was a no-op because no API key is configured. */
  notConfigured: boolean;
}

/** Per-root result of a single `polishRoot` pass. */
export interface PolishRootResult {
  requested: number;
  applied: number;
  notConfigured: boolean;
}

/**
 * Collect the eligible text nodes under a detected user-content root: not
 * excluded by the shared content-detection gate (visible, non-interactive,
 * non-ad), above the minimum length, and not inside an already-processed parent.
 */
export function collectEligibleTextNodes(
  root: ParentNode,
  profile?: SiteProfile,
  minLength: number = MIN_TEXT_LENGTH,
): Text[] {
  const nodes: Text[] = [];
  for (const node of walkTextNodesIncludingShadow(root)) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.hasAttribute(PROCESSED_ATTR)) continue;
    if (isExcluded(parent, profile)) continue;
    const text = node.textContent ?? '';
    const trimmed = text.trim();
    if (!trimmed) continue;
    if (trimmed.length < minLength) continue;
    if (trimmed.length > MAX_TEXT_LENGTH) continue;
    nodes.push(node);
  }
  return nodes;
}

const EMPTY: PolishResult = { requested: 0, applied: 0, blocks: 0, pending: 0, notConfigured: false };

/**
 * Normalize for a visible-text comparison: collapse whitespace, lowercase,
 * and drop punctuation — a reader would not notice any of those alone.
 */
function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when two strings differ in a way a reader would actually notice.
 * Treats whitespace-only, case-only, and punctuation-only differences as
 * "unchanged".
 */
export function isMeaningfullyChanged(original: string, polished: string): boolean {
  return normalizeForCompare(original) !== normalizeForCompare(polished);
}

/**
 * Class added to a text block while its rewrite request is in flight; the
 * injected stylesheet animates it (moving light-gray diagonal stripes). It is
 * removed when the block is rewritten (blue highlight span) or left unchanged.
 */
export const PENDING_CLASS = 'text-polisher-pending';

function markPending(node: Text): void {
  node.parentElement?.classList.add(PENDING_CLASS);
}

function clearPending(node: Text): void {
  node.parentElement?.classList.remove(PENDING_CLASS);
}

/** Apply one transform result to a single collected node; true if rewritten. */
function applyOne(node: Text, res: TransformResult | undefined): boolean {
  if (!node || !res || !res.ok || !res.text) return false;
  // Guard against a node that detached while awaiting the response.
  if (!node.isConnected) return false;
  const parent = node.parentElement;
  if (!parent || parent.hasAttribute(PROCESSED_ATTR)) return false;
  const original = node.textContent ?? '';
  // Only highlight/rewrite when the change is one a reader would notice
  // (never for whitespace- or case-only differences).
  if (!isMeaningfullyChanged(original, res.text)) return false;
  // React-safe: mutate the text node in place (no element replacement).
  // The parent element gets the highlight class and tooltip so the user can
  // see what changed and compare with the original on hover.
  node.textContent = res.text;
  parent.classList.add('text-polished');
  parent.title = `Original: ${original}\nConfidence: ${res.confidence ?? 'n/a'}`;
  if (res.confidence != null) parent.dataset.confidence = String(res.confidence);
  return true;
}

/**
 * Send one `transform-text` batch to the background, retrying on failure.
 * Firefox's MV3 background is a suspendable event page: on a cold wake the first
 * content-script message can be dropped ("receiving end does not exist"). Retry
 * with backoff so a wake-up race never silently turns into 0 rewrites.
 */
async function sendTransformBatch(texts: string[]): Promise<TransformTextReply | undefined> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await browser.runtime.sendMessage({
        type: 'transform-text',
        texts,
      } satisfies TransformTextMessage);
      if (res && typeof res === 'object' && (res as TransformTextReply).type === 'transform-text-result') {
        return res as TransformTextReply;
      }
    } catch {
      // Background still waking up — fall through and retry.
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
  }
  return undefined;
}

/**
 * Polish a set of content roots: collect eligible text nodes across all roots,
 * then send+apply them in small sequential batches so rewrites appear
 * incrementally and one slow batch never wipes out the whole pass. Roots that
 * got at least one rewrite are marked processed (idempotency), so a later pass
 * can still retry failures.
 */
export async function polishRoots(roots: Element[], hostname: string): Promise<PolishResult> {
  const blocks = roots.length;
  const profile = getSiteProfile(hostname);
  const groups: { root: Element; nodes: Text[] }[] = [];
  for (const root of roots) {
    // Idempotency: skip a root already processed on an earlier pass.
    if (root.hasAttribute(PROCESSED_ATTR)) continue;
    const nodes = collectEligibleTextNodes(root, profile);
    if (nodes.length === 0) continue;
    groups.push({ root, nodes });
  }
  const requested = groups.reduce((sum, g) => sum + g.nodes.length, 0);
  if (groups.length === 0) return { requested: 0, applied: 0, blocks, pending: 0, notConfigured: false };

  const flatNodes = groups.flatMap((g) => g.nodes);
  const texts = flatNodes.map((n) => n.textContent ?? '');

  const nodeResults = new Map<Text, TransformResult>();
  const appliedNodes = new Set<Text>();
  let notConfigured = false;
  let messageFailed = false;

  for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
    const sliceTexts = texts.slice(offset, offset + BATCH_SIZE);
    const sliceNodes = flatNodes.slice(offset, offset + BATCH_SIZE);
    // Show the "in progress" animation on each block while its rewrite request
    // is in flight; it turns blue on rewrite or reverts when unchanged.
    for (const n of sliceNodes) markPending(n);
    const reply = await sendTransformBatch(sliceTexts);
    if (!reply) {
      messageFailed = true;
      for (const n of sliceNodes) clearPending(n);
      console.debug('[Text Polisher] transform-text message failed after retries');
      break; // Channel is unreliable right now — keep the partial progress.
    }
    if (reply.notConfigured) {
      notConfigured = true;
      for (const n of sliceNodes) clearPending(n);
      break;
    }
    for (let i = 0; i < sliceNodes.length; i++) {
      const node = sliceNodes[i]!;
      // Capture the parent before applyOne (replaceWith detaches the node).
      const parent = node.parentElement;
      const res = reply.results[i];
      if (res) nodeResults.set(node, res);
      if (applyOne(node, res)) appliedNodes.add(node);
      parent?.classList.remove(PENDING_CLASS);
    }
  }

  const applied = appliedNodes.size;
  for (const g of groups) {
    const results = g.nodes.map((n) => nodeResults.get(n));
    const allAttempted = results.every((r) => r !== undefined);
    const allOk = allAttempted && results.every((r) => r!.ok);
    const groupApplied = g.nodes.filter((n) => appliedNodes.has(n)).length;
    // Mark processed when something changed OR every node got a usable (ok)
    // result — a fully-attempted root (including verbatim/no-improvement) is
    // not worth re-requesting. Only a partial/failed pass stays unmarked so a
    // later run can retry the failures.
    if (groupApplied > 0 || allOk) markProcessed(g.root);
  }

  if (applied < requested || messageFailed) {
    // Diagnostic: why did eligible nodes not get rewritten? Breakdowns of
    // result errors (and low-confidence rejections) help diagnose page issues.
    const errCounts = new Map<string, number>();
    for (const r of nodeResults.values()) {
      if (r && !r.ok) errCounts.set(r.error ?? 'unknown', (errCounts.get(r.error ?? 'unknown') ?? 0) + 1);
    }
    if (messageFailed) errCounts.set('message-failed', (errCounts.get('message-failed') ?? 0) + 1);
    console.debug(
      '[Text Polisher] partial apply:',
      `applied=${applied}/${requested}`,
      'errors=',
      JSON.stringify(Object.fromEntries(errCounts)),
    );
  }
  return { requested, applied, blocks, pending: 0, notConfigured };
}

/**
 * Polish a single content root (scroll-driven / per-root path). The root is
 * marked processed only when at least one rewrite is applied, so a later pass
 * with a key can still retry after a full failure.
 */
export async function polishRoot(root: Element, hostname: string): Promise<PolishRootResult> {
  const r = await polishRoots([root], hostname);
  return { requested: r.requested, applied: r.applied, notConfigured: r.notConfigured };
}

/**
 * Polish every detected user-content block on the page in one pass (legacy
 * entry point, used by unit/integration tests; the browser flow uses the lazy
 * pipeline in `pipeline.ts`). Detects roots → `polishRoots` each batch.
 */
export async function polishContent(hostname: string): Promise<PolishResult> {
  if (!document.body) return EMPTY;
  const roots = findUserContentRoots(document.body, hostname);
  if (roots.length === 0) return EMPTY;
  const r = await polishRoots(roots, hostname);
  return { ...r, pending: 0 };
}
