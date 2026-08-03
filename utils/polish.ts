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
  /** True when the request was a no-op because no API key is configured. */
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

const EMPTY: PolishResult = { requested: 0, applied: 0, blocks: 0, notConfigured: false };

/**
 * Polish every detected user-content block on the page: detect roots →
 * collect eligible text nodes → `transform-text` to background → apply results
 * back to the same nodes. Roots are only marked processed once a real
 * (non-no-op) pass applies at least one rewrite, so a later click with a key can
 * still retry after a full failure.
 */
export async function polishContent(hostname: string): Promise<PolishResult> {
  if (!document.body) return EMPTY;

  const roots = findUserContentRoots(document.body, hostname);
  if (roots.length === 0) return EMPTY;

  const nodes: Text[] = [];
  for (const root of roots) {
    // Idempotency: skip a root already processed on an earlier pass.
    if (root instanceof Element && root.hasAttribute(PROCESSED_ATTR)) continue;
    nodes.push(...collectEligibleTextNodes(root));
  }
  if (nodes.length === 0) return { ...EMPTY, blocks: roots.length };

  const texts = nodes.map((n) => n.textContent ?? '');

  let reply: TransformTextReply | undefined;
  try {
    const res = await browser.runtime.sendMessage({
      type: 'transform-text',
      texts,
    } satisfies TransformTextMessage);
    if (res && typeof res === 'object' && (res as TransformTextReply).type === 'transform-text-result') {
      reply = res as TransformTextReply;
    }
  } catch {
    reply = undefined;
  }

  if (!reply || reply.notConfigured || !Array.isArray(reply.results)) {
    return { requested: texts.length, applied: 0, blocks: roots.length, notConfigured: !reply || reply.notConfigured };
  }

  let applied = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const res = reply.results[i];
    if (!res || !res.ok || !res.text) continue;
    // Guard against a node that detached while awaiting the response.
    if (!node.isConnected) continue;
    const parent = node.parentElement;
    if (!parent || parent.hasAttribute(PROCESSED_ATTR)) continue;
    if (res.text === node.textContent) continue; // model returned it unchanged
    node.textContent = res.text;
    applied++;
  }

  // Retain idempotency: mark processed roots so a re-click doesn't re-transform.
  if (applied > 0) {
    for (const root of roots) markProcessed(root);
  }

  return { requested: texts.length, applied, blocks: roots.length, notConfigured: false };
}
