/**
 * Shadow-DOM-aware DOM traversal helpers.
 *
 * Modern React/WebComponents sites (e.g. www.reddit.com's `shreddit-*` custom
 * elements) render user-generated content inside **shadow roots**. A plain
 * `document.createTreeWalker(node)` only sees the light DOM, so a replacer built
 * on it reports "N replaced" while the *visible* text (in the shadow root) is
 * never touched. These helpers pierce shadow boundaries so detection and
 * replacement operate on the real, on-screen DOM.
 */

/** Like `ancestor.contains(el)`, but also true when `el` lives inside any shadow
 *  root reachable from `ancestor` (including nested shadow trees). */
export function containsIncludingShadow(ancestor: Node, el: Node): boolean {
  if (ancestor === el) return true;
  if (ancestor.contains(el)) return true;
  let n: Node | null = el;
  while (n) {
    if (n === ancestor) return true;
    if (n.parentNode) {
      n = n.parentNode;
      continue;
    }
    // Reached the top of a shadow tree — hop across to its light-DOM host and
    // keep climbing, so we see whether `ancestor` wraps the whole shadow host.
    const root = n.getRootNode();
    if (root instanceof ShadowRoot) {
      n = root.host;
      continue;
    }
    break;
  }
  return false;
}

/** Collect every shadow root reachable from `root`, piercing nested shadow trees. */
export function collectShadowRoots(root: ParentNode): ShadowRoot[] {
  const found: ShadowRoot[] = [];
  // The root itself may be a shadow host whose shadowRoot holds the visible text.
  if (root instanceof Element && root.shadowRoot) {
    found.push(root.shadowRoot);
    found.push(...collectShadowRoots(root.shadowRoot));
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as Element;
    if (el.shadowRoot) {
      found.push(el.shadowRoot);
      found.push(...collectShadowRoots(el.shadowRoot));
    }
  }
  return found;
}

/** Yield every text node in `root`'s light tree plus all reachable shadow roots. */
export function* walkTextNodesIncludingShadow(root: ParentNode): Generator<Text> {
  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = textWalker.nextNode())) yield node as Text;
  for (const sr of collectShadowRoots(root)) {
    const walker = document.createTreeWalker(sr, NodeFilter.SHOW_TEXT);
    while ((node = walker.nextNode())) yield node as Text;
  }
}

/** Yield every element in `root`'s light tree plus all reachable shadow roots. */
export function* walkElementsIncludingShadow(root: ParentNode): Generator<Element> {
  const elWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = elWalker.nextNode())) yield node as Element;
  for (const sr of collectShadowRoots(root)) {
    const walker = document.createTreeWalker(sr, NodeFilter.SHOW_ELEMENT);
    while ((node = walker.nextNode())) yield node as Element;
  }
}

/**
 * True if the element (or any ancestor) is not visually rendered: inside an
 * aria-hidden / hidden / screen-reader-only subtree, or display:none/visibility
 * hidden. User text we polish must be actually visible.
 */
export function isVisible(el: Element): boolean {
  if (
    el.closest(
      '[aria-hidden="true"], [hidden], .sr-only, .screen-reader, .visually-hidden, faceplate-screen-reader-content',
    )
  ) {
    return false;
  }
  // Walk up the current tree to its root element, and hop across shadow
  // boundaries so a hidden light-DOM ancestor (e.g. a Tailwind `.hidden` div
  // that hides an entire Rooms panel) is seen from deep inside a shadow root.
  let node: Element | null = el;
  let guard = 0;
  while (node && guard++ < 80) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (node.parentElement) {
      node = node.parentElement;
    } else {
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
  }
  return true;
}
