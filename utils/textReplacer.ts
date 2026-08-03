/**
 * React/Vue-safe text replacement module.
 *
 * Design principle (D2): operate on TEXT NODES only via TreeWalker — never mutate
 * whole elements with `textContent`/`innerHTML`. Replacing whole elements destroys
 * element references, event listeners, and the page framework's fiber/vdom state
 * (Facebook/Reddit use React). Mutating only text nodes keeps the DOM tree intact.
 *
 * Design (D3): original text is retained weakly (WeakMap keyed by the text node, so
 * removed nodes can be garbage-collected) and processed containers are marked with
 * an in-DOM attribute to prevent duplicate replacement.
 */

import { walkTextNodesIncludingShadow, isVisible } from './domWalk';

/** In-DOM marker used to skip already-processed containers (Pitfall #10). */
export const PROCESSED_ATTR = 'data-text-polished';

const originals = new WeakMap<Text, string>();

export interface ReplaceOptions {
  /** Deterministic transform applied to each eligible text node's content. */
  transform: (text: string) => string;
  /** Minimum trimmed length before a text node is considered replaceable. */
  minLength?: number;
}

/**
 * Replace a single text node's content, recording its original for restore/debug.
 * Returns true if a replacement was made.
 */
export function replaceTextNode(node: Text, options: ReplaceOptions): boolean {
  const original = node.textContent ?? '';
  if (!original.trim()) return false;
  if ((options.minLength ?? 0) > 0 && original.trim().length < (options.minLength ?? 0)) {
    return false;
  }
  originals.set(node, original);
  node.textContent = options.transform(original);
  return true;
}

/**
 * Walk `root`'s descendant text nodes and replace each eligible one at most once.
 * Returns the number of text nodes replaced.
 */
export function replaceTextNodes(root: ParentNode, options: ReplaceOptions): number {
  // Idempotency guard: a root already processed on a previous pass is skipped
  // whole. Fixes double/plural prefixing when the action button is clicked
  // again (comment text lives under nested descendants of the root, so marking
  // only the root plus the per-parent check above is not enough to prevent a
  // second pass from re-touching it).
  if (root instanceof Element && root.hasAttribute(PROCESSED_ATTR)) return 0;

  // Walk text nodes inside the root AND inside any reachable shadow root, so on
  // WebComponents/React sites (e.g. Reddit's shreddit-* elements) we replace the
  // *visible* text rather than only light-DOM filler.  D6.
  let count = 0;
  for (const node of walkTextNodesIncludingShadow(root)) {
    const parent = node.parentElement;
    if (!parent) continue;
    // Skip text inside containers we have already processed.
    if (parent.hasAttribute(PROCESSED_ATTR)) continue;
    // Skip UI/interactive/structural containers (Pitfall #3).
    if (isUiElement(parent)) continue;
    // Skip invisible text (screen-reader, aria-hidden, display:none, ads).
    if (!isVisible(parent)) continue;
    if (replaceTextNode(node, options)) count++;
  }
  return count;
}

/**
 * Restore a single text node back to its original content (debug/cleanup).
 * Returns false if the node was never recorded or no longer exists.
 */
export function restoreTextNode(node: Text): boolean {
  const original = originals.get(node);
  if (original === undefined) return false;
  node.textContent = original;
  originals.delete(node);
  return true;
}

/**
 * Mark a container as processed so the walker skips it on later passes.
 * We mark the *container* (parent) rather than each text node so React's text
 * nodes are untouched by attribute writes on every node.
 */
export function markProcessed(el: Element): void {
  el.setAttribute(PROCESSED_ATTR, 'true');
}

/**
 * Heuristic exclusion: skip interactive, structural, and embedded-UI containers so
 * we never polish buttons, navigation, links, ads, or form controls (Pitfall #3).
 * Phase 2 will add fuller content detection; this is the conservative Phase 1 guard.
 */
export function isUiElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (
    [
      'button', 'a', 'input', 'textarea', 'select', 'label', 'option',
      'script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed',
      'svg', 'canvas', 'video', 'audio', 'nav', 'header', 'footer', 'aside',
      'form', 'menu',
    ].includes(tag)
  ) {
    return true;
  }
  const role = (el.getAttribute('role') ?? '').toLowerCase();
  if (
    [
      'button', 'link', 'navigation', 'banner', 'dialog', 'menu', 'tab',
      'toolbar', 'complementary', 'contentinfo', 'search', 'presentation',
    ].includes(role)
  ) {
    return true;
  }
  // Nested inside a known interactive/structural region (ancestors, not just the
  // direct parent). Includes button/[role=button]/a/input so text wrapped in a
  // span/div inside a button (e.g. "Continue with Phone Number") is rejected.
  // NOTE: no bare [aria-label] here — Reddit stamps aria-labels on content
  // containers, so a blanket aria-label rule would reject real post/comment text.
  if (
    el.closest(
      'button, [role="button"], a, input, textarea, select, label, form, ' +
        'nav, header, footer, aside, [role="navigation"], [role="banner"]',
    )
  ) {
    return true;
  }
  return false;
}

/** Read the recorded original for a node (debug/introspection). */
export function getOriginal(node: Text): string | undefined {
  return originals.get(node);
}
