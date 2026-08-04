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
import { findUserContentRoots } from './contentDetector';
import { walkTextNodesIncludingShadow, isVisible } from './domWalk';
import { isUiElement, markProcessed, PROCESSED_ATTR } from './textReplacer';
import { MIN_TEXT_LENGTH, MAX_TEXT_LENGTH } from './settings';
import type { TransformResult } from './llmClient';

/** Message the content script sends to the background to transform a batch. */
export interface TransformTextMessage {
  type: 'transform-text';
  texts: string[];
}

/** Reply from the background after running the batch. */
export interface TransformTextReply {
  type: 'transform-text-result';
  results: TransformResult[];
  /** True when no API key is configured (content then does nothing). */
  notConfigured: boolean;
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
 * Collect the eligible text nodes under a detected user-content root: visible,
 * non-UI, above the minimum length, and not inside an already-processed parent.
 */
export function collectEligibleTextNodes(
  root: ParentNode,
  minLength: number = MIN_TEXT_LENGTH,
): Text[] {
  const nodes: Text[] = [];
  for (const node of walkTextNodesIncludingShadow(root)) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.hasAttribute(PROCESSED_ATTR)) continue;
    if (isUiElement(parent)) continue;
    if (!isVisible(parent)) continue;
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
  // Wrap the rewrite in a highlighted span so the user can see what changed;
  // the original text is exposed as a native tooltip on hover.
  const span = document.createElement('span');
  span.className = 'text-polished';
  span.title = original;
  span.textContent = res.text;
  span.style.setProperty('background-color', '#cfe4f7'); // light blue
  span.style.setProperty('border-radius', '2px');
  node.replaceWith(span);
  return true;
}

/**
 * Polish a set of content roots in one batched request: collect eligible text
 * nodes across all roots → one `transform-text` message to the background →
 * apply results back to the same nodes. Roots that got at least one rewrite are
 * marked processed (idempotency), so a later pass can still retry failures.
 */
export async function polishRoots(roots: Element[], hostname: string): Promise<PolishResult> {
  const blocks = roots.length;
  const groups: { root: Element; nodes: Text[] }[] = [];
  for (const root of roots) {
    // Idempotency: skip a root already processed on an earlier pass.
    if (root.hasAttribute(PROCESSED_ATTR)) continue;
    const nodes = collectEligibleTextNodes(root);
    if (nodes.length === 0) continue;
    groups.push({ root, nodes });
  }
  const requested = groups.reduce((sum, g) => sum + g.nodes.length, 0);
  if (groups.length === 0) return { requested: 0, applied: 0, blocks, pending: 0, notConfigured: false };

  const texts = groups.flatMap((g) => g.nodes.map((n) => n.textContent ?? ''));

  let reply: TransformTextReply | undefined;
  let sendMessageFailed = false;
  try {
    const res = await browser.runtime.sendMessage({
      type: 'transform-text',
      texts,
    } satisfies TransformTextMessage);
    if (res && typeof res === 'object' && (res as TransformTextReply).type === 'transform-text-result') {
      reply = res as TransformTextReply;
    }
  } catch {
    sendMessageFailed = true;
  }

  if (sendMessageFailed || !reply || !Array.isArray(reply.results)) {
    return { requested, applied: 0, blocks, pending: 0, notConfigured: false };
  }
  if (reply.notConfigured) {
    return { requested, applied: 0, blocks, pending: 0, notConfigured: true };
  }

  let applied = 0;
  let offset = 0;
  for (const g of groups) {
    let groupApplied = 0;
    let allOk = true;
    for (let i = 0; i < g.nodes.length; i++) {
      const res = reply.results[offset + i];
      if (!res || !res.ok) allOk = false;
      if (applyOne(g.nodes[i]!, res)) {
        groupApplied++;
        applied++;
      }
    }
    offset += g.nodes.length;
    // Mark processed when something changed OR every node got a usable (ok)
    // result — a fully-attempted root (including verbatim/no-improvement) is
    // not worth re-requesting. Only a partial/failed pass stays unmarked so a
    // later run can retry the failures.
    if (groupApplied > 0 || allOk) markProcessed(g.root);
  }
  return { requested, applied, blocks, pending: 0, notConfigured: false };
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
