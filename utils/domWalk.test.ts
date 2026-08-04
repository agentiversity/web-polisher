// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  containsIncludingShadow,
  closestIncludingShadow,
  collectShadowRoots,
  walkTextNodesIncludingShadow,
  walkElementsIncludingShadow,
  isVisible,
} from './domWalk';

function setup(bodyHtml: string): HTMLElement {
  document.body.innerHTML = bodyHtml;
  return document.body;
}

/** Create a shadow host with open shadow root and return both. */
function makeShadowHost(tag = 'my-component'): { host: Element; shadow: ShadowRoot } {
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  return { host, shadow };
}

describe('containsIncludingShadow', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns true when ancestor === el', () => {
    const div = document.createElement('div');
    expect(containsIncludingShadow(div, div)).toBe(true);
  });

  it('returns true for light-DOM containment', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.append(child);
    document.body.append(parent);
    expect(containsIncludingShadow(parent, child)).toBe(true);
  });

  it('returns false when not contained', () => {
    const a = document.createElement('div');
    const b = document.createElement('span');
    document.body.append(a, b);
    expect(containsIncludingShadow(a, b)).toBe(false);
  });

  it('returns true when el is inside a shadow root of ancestor', () => {
    const { host, shadow } = makeShadowHost();
    const inner = document.createElement('p');
    shadow.append(inner);
    expect(containsIncludingShadow(host, inner)).toBe(true);
  });

  it('returns false when el is in a different shadow tree', () => {
    const { host: h1 } = makeShadowHost('comp-a');
    const { host: h2, shadow: s2 } = makeShadowHost('comp-b');
    const inner = document.createElement('p');
    s2.append(inner);
    expect(containsIncludingShadow(h1, inner)).toBe(false);
  });

  it('pierces nested shadow DOM boundaries', () => {
    const outer = document.createElement('outer-host');
    const outerShadow = outer.attachShadow({ mode: 'open' });
    const inner = document.createElement('inner-host');
    const innerShadow = inner.attachShadow({ mode: 'open' });
    const deep = document.createElement('p');
    outerShadow.append(inner);
    innerShadow.append(deep);
    document.body.append(outer);
    // outer contains deep via outer → outerShadow → inner → innerShadow → deep
    expect(containsIncludingShadow(outer, deep)).toBe(true);
  });
});

describe('closestIncludingShadow', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('finds a matching ancestor in light DOM', () => {
    setup('<div id="outer"><div id="mid"><span id="target">text</span></div></div>');
    const target = document.getElementById('target')!;
    const result = closestIncludingShadow(target, '#outer');
    expect(result).toBe(document.getElementById('outer'));
  });

  it('returns null when no ancestor matches', () => {
    setup('<div><span id="target">text</span></div>');
    const target = document.getElementById('target')!;
    expect(closestIncludingShadow(target, 'button')).toBeNull();
  });

  it('finds a shadow-host ancestor from inside its shadow tree', () => {
    const host = document.createElement('my-button');
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('span');
    shadow.append(inner);
    document.body.append(host);
    // el.closest('my-button') would NOT find the host from inside shadow,
    // but closestIncludingShadow should.
    const result = closestIncludingShadow(inner, 'my-button');
    expect(result).toBe(host);
  });

  it('finds a matching ancestor above a shadow boundary', () => {
    const wrapper = document.createElement('div');
    wrapper.id = 'outside';
    const { host, shadow } = makeShadowHost();
    const inner = document.createElement('span');
    shadow.append(inner);
    wrapper.append(host);
    document.body.append(wrapper);
    const result = closestIncludingShadow(inner, '#outside');
    expect(result).toBe(wrapper);
  });

  it('pierces nested shadow boundaries', () => {
    const outer = document.createElement('outer-host');
    const outerShadow = outer.attachShadow({ mode: 'open' });
    const btn = document.createElement('my-button');
    const btnShadow = btn.attachShadow({ mode: 'open' });
    const deep = document.createElement('span');
    outerShadow.append(btn);
    btnShadow.append(deep);
    document.body.append(outer);
    // deep → btn (shadow boundary) → outer
    const result = closestIncludingShadow(deep, 'my-button');
    expect(result).toBe(btn);
  });

  it('does not cross more than 80 ancestors (guard)', () => {
    // Build a deeply nested light-DOM chain of 100 divs.
    let root = document.createElement('div');
    root.id = 'top';
    let current = root;
    for (let i = 0; i < 99; i++) {
      const child = document.createElement('div');
      current.append(child);
      current = child;
    }
    document.body.append(root);
    // The innermost div looks for #top — the guard of 80 prevents finding it.
    expect(closestIncludingShadow(current, '#top')).toBeNull();
  });
});

describe('collectShadowRoots', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns empty array when no shadow roots exist', () => {
    setup('<div><p>text</p></div>');
    expect(collectShadowRoots(document.body)).toEqual([]);
  });

  it('collects a single shadow root', () => {
    const { shadow } = makeShadowHost();
    shadow.append(document.createElement('p'));
    const roots = collectShadowRoots(document.body);
    expect(roots).toHaveLength(1);
  });

  it('collects nested shadow roots without duplicates', () => {
    const outer = document.createElement('outer-host');
    const outerShadow = outer.attachShadow({ mode: 'open' });
    const inner = document.createElement('inner-host');
    const innerShadow = inner.attachShadow({ mode: 'open' });
    outerShadow.append(inner);
    document.body.append(outer);
    const roots = collectShadowRoots(document.body);
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBe(outerShadow);
    expect(roots[1]).toBe(innerShadow);
  });

  it('does not visit the same shadow root twice (deduplication)', () => {
    const host = document.createElement('my-host');
    const shadow = host.attachShadow({ mode: 'open' });
    // Put a child that also has a shadow root inside the first shadow root.
    const child = document.createElement('child-host');
    const childShadow = child.attachShadow({ mode: 'open' });
    childShadow.append(document.createElement('p'));
    shadow.append(child);
    // Also put the same child in light DOM (would cause TreeWalker to find it again).
    document.body.append(host);
    const roots = collectShadowRoots(document.body);
    expect(roots).toHaveLength(2);
    // Verify no duplicates.
    expect(new Set(roots).size).toBe(2);
  });

  it('collects sibling shadow roots', () => {
    const { shadow: s1 } = makeShadowHost('comp-a');
    const { shadow: s2 } = makeShadowHost('comp-b');
    s1.append(document.createElement('p'));
    s2.append(document.createElement('span'));
    const roots = collectShadowRoots(document.body);
    expect(roots).toHaveLength(2);
    expect(roots).toContain(s1);
    expect(roots).toContain(s2);
  });
});

describe('walkTextNodesIncludingShadow', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('yields text nodes from light DOM', () => {
    setup('<p>hello</p><span>world</span>');
    const nodes = [...walkTextNodesIncludingShadow(document.body)];
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.textContent)).toEqual(['hello', 'world']);
  });

  it('yields text nodes from shadow roots', () => {
    const { shadow } = makeShadowHost();
    const p = document.createElement('p');
    p.textContent = 'shadow text';
    shadow.append(p);
    document.body.append(document.createElement('p'));
    document.body.lastElementChild!.textContent = 'light text';
    const nodes = [...walkTextNodesIncludingShadow(document.body)];
    expect(nodes.map((n) => n.textContent)).toContain('shadow text');
    expect(nodes.map((n) => n.textContent)).toContain('light text');
  });

  it('does not yield duplicate text nodes from shadow roots', () => {
    const { shadow } = makeShadowHost();
    const p = document.createElement('p');
    p.textContent = 'once';
    shadow.append(p);
    const nodes = [...walkTextNodesIncludingShadow(document.body)];
    const onceTexts = nodes.filter((n) => n.textContent === 'once');
    expect(onceTexts).toHaveLength(1);
  });
});

describe('walkElementsIncludingShadow', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('yields elements from light DOM', () => {
    setup('<div><p>text</p></div>');
    const els = [...walkElementsIncludingShadow(document.body)];
    expect(els.some((e) => e.tagName === 'DIV')).toBe(true);
    expect(els.some((e) => e.tagName === 'P')).toBe(true);
  });

  it('yields elements from shadow roots', () => {
    const { shadow } = makeShadowHost();
    const span = document.createElement('span');
    shadow.append(span);
    const els = [...walkElementsIncludingShadow(document.body)];
    expect(els).toContain(span);
  });
});

describe('isVisible', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns true for a visible element', () => {
    setup('<p>visible text</p>');
    expect(isVisible(document.querySelector('p')!)).toBe(true);
  });

  it('returns false for aria-hidden="true"', () => {
    setup('<div aria-hidden="true"><p>hidden</p></div>');
    expect(isVisible(document.querySelector('p')!)).toBe(false);
  });

  it('returns false for [hidden] attribute', () => {
    setup('<div hidden><p>hidden</p></div>');
    expect(isVisible(document.querySelector('p')!)).toBe(false);
  });

  it('returns false for .sr-only class', () => {
    setup('<div class="sr-only"><p>screen reader</p></div>');
    expect(isVisible(document.querySelector('p')!)).toBe(false);
  });

  it('returns false for .visually-hidden class', () => {
    setup('<div class="visually-hidden"><p>hidden</p></div>');
    expect(isVisible(document.querySelector('p')!)).toBe(false);
  });

  it('returns false when parent has display:none (via computed style)', () => {
    setup('<div id="hider"><p>hidden child</p></div>');
    const hider = document.getElementById('hider')!;
    // jsdom doesn't compute styles, so we mock getComputedStyle.
    const origGC = window.getComputedStyle;
    window.getComputedStyle = ((el: Element) => ({
      display: el === hider ? 'none' : '',
      visibility: '',
    })) as unknown as typeof getComputedStyle;
    try {
      expect(isVisible(document.querySelector('p')!)).toBe(false);
    } finally {
      window.getComputedStyle = origGC;
    }
  });

  it('returns false when parent has visibility:hidden', () => {
    setup('<div id="hider"><p>hidden child</p></div>');
    const hider = document.getElementById('hider')!;
    const origGC = window.getComputedStyle;
    window.getComputedStyle = ((el: Element) => ({
      display: '',
      visibility: el === hider ? 'hidden' : '',
    })) as unknown as typeof getComputedStyle;
    try {
      expect(isVisible(document.querySelector('p')!)).toBe(false);
    } finally {
      window.getComputedStyle = origGC;
    }
  });

  it('returns false for faceplate-screen-reader-content', () => {
    setup('<faceplate-screen-reader-content><p>sr only</p></faceplate-screen-reader-content>');
    expect(isVisible(document.querySelector('p')!)).toBe(false);
  });
});
