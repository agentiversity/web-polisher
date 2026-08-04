/**
 * Content Detector (Phase 2).
 *
 * Two-stage detection (design D1/D4): a node is user-generated content when it is
 * NOT excluded (negative rules win) AND it matches a positive signal (known content
 * selector / role) OR passes a heuristic. Known sites (Facebook, Reddit) use a
 * data-driven selector registry; unknown sites fall back to generic heuristics.
 *
 * Detection pierces shadow DOM (see domWalk.ts) so WebComponents-heavy sites like
 * www.reddit.com (shreddit-*) expose their real content roots.
 *
 * This replaces the Phase-1 `isUiElement` stopgap as the primary gate. The replacer
 * in `utils/textReplacer.ts` keeps its own basic guard as a secondary safety net.
 */

import { containsIncludingShadow, closestIncludingShadow, walkElementsIncludingShadow, isVisible } from './domWalk';

export interface SiteProfile {
  /** Base domains this profile applies to (e.g. 'reddit.com' matches www/old/new). */
  hostnames: string[];
  /** Selectors that mark user-generated content (comments/posts). */
  contentSelectors: string[];
  /** Selectors that must never be touched (UI/nav/ads/interactive wrappers). */
  excludeSelectors: string[];
}

/**
 * Data-driven selector registry (design D2): add a new site here without touching
 * detection logic. Selectors seen during the Phase-1 Reddit test are included so the
 * known non-`<button>` interactive wrappers are excluded.
 */
export const siteRegistry: SiteProfile[] = [
  {
    hostnames: ['reddit.com'],
    contentSelectors: [
      '[data-testid="comment"]',
      '.Comment',
      '.md',
      'shreddit-comment',
      'shreddit-post',
      'div.md',
    ],
    excludeSelectors: [
      'button',
      'a',
      'nav',
      'input',
      'textarea',
      'select',
      'label',
      '[role="button"]',
      '[role="navigation"]',
      'shreddit-post-menu',
      'faceplate-tracker[noun="button"]',
      '[slot="menu"]',
      'faceplate-screen-reader-content',
      'shreddit-ad-post',
      'shreddit-dynamic-ad-link',
      '[role="tooltip"]',
      '[slot="tooltip-content"]',
      'faceplate-menu',
      'rpl-dropdown',
      'rpl-tooltip',
      'shreddit-post-overflow-menu',
      'rs-rooms-nav',
      'rs-room-creation-button',
      'rs-welcome-screen',
      'rs-rooms-nav-filter',
      'rs-app',
      'achievements-entrypoint',
      'crosspost-destination-picker',
      'rpl-modal-card',
      'rpl-dialog',
    ],
  },
  {
    hostnames: ['facebook.com'],
    contentSelectors: [
      '[data-testid="comment"]',
      '[data-testid="story-comment"]',
      '[role="article"]',
      '.userContent',
    ],
    excludeSelectors: [
      'button',
      'a',
      'nav',
      'input',
      'textarea',
      'select',
      'label',
      '[role="button"]',
      '[role="navigation"]',
    ],
  },
];

const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'input', 'textarea', 'select', 'label', 'option', 'iframe', 'object',
  'embed', 'svg', 'canvas', 'video', 'audio', 'nav', 'header', 'footer', 'aside',
  'form', 'menu', 'summary', 'dialog',
]);

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'navigation', 'banner', 'dialog', 'alertdialog', 'menu', 'menuitem',
  'tab', 'toolbar', 'search', 'combobox', 'textbox', 'checkbox', 'radio', 'switch',
  'listbox', 'option', 'complementary', 'contentinfo',
]);

/** Minimum text length for the heuristic to consider an unknown element user content. */
const HEURISTIC_MIN_LEN = 40;

/** Resolve a site profile from a hostname (base-domain match, strips www). */
export function getSiteProfile(hostname?: string): SiteProfile | undefined {
  if (!hostname) return undefined;
  const h = normalize(hostname);
  return siteRegistry.find((p) =>
    p.hostnames.some((base) => {
      const b = normalize(base);
      return h === b || h.endsWith(`.${b}`);
    }),
  );
}

function normalize(host: string): string {
  return host.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
}

/** True if the element itself is interactive/structural by tag, role, or focusability. */
function isInteractiveByNature(el: Element): boolean {
  if (INTERACTIVE_TAGS.has(el.tagName.toLowerCase())) return true;
  const role = (el.getAttribute('role') ?? '').toLowerCase();
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  // Focusable interactive controls are interactive. A bare aria-label/labelledby is
  // NOT interactive on its own — Reddit stamps aria-labels on content containers too.
  const tabIndex = el.getAttribute('tabindex');
  if (tabIndex !== null && tabIndex !== '-1') return true;
  return false;
}

function matchesAny(el: Element, selectors: string[]): boolean {
  return selectors.some((sel) => {
    try {
      return sel.startsWith(':') ? false : el.matches(sel);
    } catch {
      return false;
    }
  });
}

/**
 * Exclusion check: true if the element or any of its ancestors is interactive,
 * structural, an ad/nav region, or matches the site's exclude selectors. Exclusion
 * always wins (design D1).
 */
export function isExcluded(el: Element, profile?: SiteProfile): boolean {
  // Hidden / screen-reader / ad content must never be polished.
  if (!isVisible(el)) return true;
  let node: Element | null = el;
  while (node && node !== document.body) {
    if (isInteractiveByNature(node)) return true;
    if (profile && matchesAny(node, profile.excludeSelectors)) return true;
    node = node.parentElement;
  }
  // Ad / sponsored / complementary regions anywhere up the tree (shadow-aware).
  if (
    closestIncludingShadow(el, 'aside, [class*="advert"], [class*="sponsor"], [data-nosnippet], [role="complementary"]')
  ) {
    return true;
  }
  return false;
}

/** True if the element matches a known content signal (site selector, tag, or generic role). */
function matchesContentSignal(el: Element, profile?: SiteProfile): boolean {
  if (profile && matchesAny(el, profile.contentSelectors)) return true;
  // Semantic HTML tags that strongly indicate user-generated content.
  const tag = el.tagName.toLowerCase();
  if (tag === 'article' || tag === 'blockquote') return true;
  const role = (el.getAttribute('role') ?? '').toLowerCase();
  return role === 'article' || role === 'comment' || role === 'feed';
}

/** Heuristic fallback for unknown sites: substantial text, low interactivity. */
function passesHeuristic(el: Element): boolean {
  const text = (el.textContent ?? '').trim();
  if (text.length < HEURISTIC_MIN_LEN) return false;
  // Containers full of interactive controls are likely navigation/menus, not comments.
  const interactiveCount = el.querySelectorAll('button, a, input, [role="button"]').length;
  return interactiveCount <= 2;
}

/** Decide whether an element is user-generated content (not excluded + positive/heuristic). */
export function isUserContentElement(el: Element, profile?: SiteProfile): boolean {
  if (isExcluded(el, profile)) return false;
  return matchesContentSignal(el, profile) || passesHeuristic(el);
}

/**
 * Collect the top-most user-content root elements under `root`, including inside
 * shadow roots. Returns only elements not nested inside another selected root
 * (shadow-aware), so the replacer can walk each once.
 */
export function findUserContentRoots(root: ParentNode, hostname?: string): Element[] {
  const profile = getSiteProfile(hostname);
  const roots: Element[] = [];
  for (const el of walkElementsIncludingShadow(root)) {
    if (roots.some((r) => containsIncludingShadow(r, el))) continue; // skip nesting inside an already-chosen root
    if (isUserContentElement(el, profile)) {
      roots.push(el);
    }
  }
  return roots;
}
