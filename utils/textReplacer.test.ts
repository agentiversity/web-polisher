// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  replaceTextNode,
  replaceTextNodes,
  restoreTextNode,
  markProcessed,
  isUiElement,
  getOriginal,
  PROCESSED_ATTR,
} from './textReplacer';

function setup(bodyHtml: string): HTMLElement {
  document.body.innerHTML = bodyHtml;
  return document.body;
}

describe('textReplacer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('replaces eligible text nodes with the transform', () => {
    const body = setup('<p>hello world</p><p><span>more text here</span></p>');
    const n = replaceTextNodes(body, { transform: (t) => t.toUpperCase() });
    expect(n).toBe(2);
    expect(document.body.textContent).toContain('HELLO WORLD');
    expect(document.body.textContent).toContain('MORE TEXT HERE');
  });

  it('skips UI/interactive containers (buttons, nav)', () => {
    setup('<button>Post Comment</button><nav>Home</nav><p>real user comment here</p>');
    const n = replaceTextNodes(document.body, { transform: () => 'X' });
    expect(n).toBe(1);
    expect((document.querySelector('button') as HTMLButtonElement).textContent).toBe('Post Comment');
    expect((document.querySelector('nav') as HTMLElement).textContent).toBe('Home');
  });

  it('skips text inside a role="button" container', () => {
    setup('<div role="button">Click me</div><p>a long enough user sentence here</p>');
    const n = replaceTextNodes(document.body, { transform: (t) => t.toUpperCase(), minLength: 8 });
    expect(n).toBe(1);
    expect((document.querySelector('div') as HTMLDivElement).textContent).toBe('Click me');
  });

  it('respects minLength threshold', () => {
    setup('<p>ok</p><p>this is a longer sentence with enough words</p>');
    const n = replaceTextNodes(document.body, { transform: () => 'X', minLength: 12 });
    expect(n).toBe(1);
  });

  it('does not re-replace containers already marked processed', () => {
    setup('<p>original user comment here</p>');
    replaceTextNodes(document.body, { transform: () => 'A' });
    const p = document.querySelector('p') as HTMLParagraphElement;
    p.setAttribute(PROCESSED_ATTR, 'true');
    const third = replaceTextNodes(document.body, { transform: () => 'B' });
    expect(third).toBe(0);
    expect(p.textContent).toBe('A');
  });

  it('does not re-prefix a root already processed on a previous pass (5a)', () => {
    // Mirrors the live flow: a comment root is processed and marked, then the
    // action button is clicked again. The root itself is skipped whole.
    setup('<div class="Comment"><div><span>a user comment body that is long enough</span></div></div>');
    const root = document.querySelector('.Comment') as HTMLElement;
    const n1 = replaceTextNodes(root, { transform: (t) => `[prefix] ${t}` });
    expect(n1).toBe(1);
    expect(root.textContent).toBe('[prefix] a user comment body that is long enough');
    markProcessed(root);
    const n2 = replaceTextNodes(root, { transform: (t) => `[prefix] ${t}` });
    expect(n2).toBe(0);
    expect(root.textContent).toBe('[prefix] a user comment body that is long enough');
  });

  it('skips text nested inside a button, not just direct children (5b)', () => {
    // Real-world buttons wrap their label in a span/div; isUiElement must reject
    // text anywhere inside the button, including via an ancestor.
    setup(
      '<button><div class="scrollable"><span>Continue with Phone Number</span></div></button><p>a real user comment body that is long enough here</p>',
    );
    const n = replaceTextNodes(document.body, { transform: (t) => t.toUpperCase(), minLength: 6 });
    expect(n).toBe(1);
    expect(document.querySelector('button')!.textContent).toBe('Continue with Phone Number');
    expect(document.querySelector('p')!.textContent).toBe(
      'A REAL USER COMMENT BODY THAT IS LONG ENOUGH HERE',
    );
  });

  it('skips invisible / screen-reader text (Reddit hidden UI)', () => {
    setup(
      '<div aria-hidden="true"><p>hidden screen reader only text here</p></div>'
      + '<p>visible real comment text here</p>',
    );
    const n = replaceTextNodes(document.body, { transform: (t) => t.toUpperCase() });
    expect(n).toBe(1);
    expect(document.querySelectorAll('p')[0]!.textContent).toBe('hidden screen reader only text here');
    expect(document.querySelectorAll('p')[1]!.textContent).toBe('VISIBLE REAL COMMENT TEXT HERE');
  });

  it('replaces text inside shadow roots (Reddit shreddit host)', () => {
    // Mirrors www.reddit.com: the visible body text lives in the shadow root of a
    // shreddit-comment host. Plain TreeWalkers never see it; the shadow-aware
    // walker must replace it while leaving light-DOM UI alone.
    const host = document.createElement('shreddit-comment');
    const shadow = host.attachShadow({ mode: 'open' });
    const bodyText = document.createElement('p');
    bodyText.textContent = 'the real visible comment body inside shadow dom';
    const buttonTxt = document.createElement('button');
    buttonTxt.textContent = 'Reply';
    shadow.append(bodyText, buttonTxt);
    document.body.append(host);

    const n = replaceTextNodes(host, { transform: (t) => `[p] ${t}` });
    expect(n).toBe(1);
    expect(shadow.querySelector('p')!.textContent).toBe('[p] the real visible comment body inside shadow dom');
    expect(shadow.querySelector('button')!.textContent).toBe('Reply');
  });

  it('records and restores originals per text node', () => {
    setup('<p>original sentence here</p>');
    const p = document.querySelector('p') as HTMLParagraphElement;
    const textNode = p.firstChild as Text;
    replaceTextNode(textNode, { transform: () => 'changed' });
    expect(textNode.textContent).toBe('changed');
    expect(getOriginal(textNode)).toBe('original sentence here');
    expect(restoreTextNode(textNode)).toBe(true);
    expect(textNode.textContent).toBe('original sentence here');
  });

  it('isUiElement detects interactive and structural elements', () => {
    setup(
      '<button id="b"></button><div role="navigation" id="n"></div><a id="l">x</a><p id="p"></p>',
    );
    expect(isUiElement(document.getElementById('b')!)).toBe(true);
    expect(isUiElement(document.getElementById('n')!)).toBe(true);
    expect(isUiElement(document.getElementById('l')!)).toBe(true);
    expect(isUiElement(document.getElementById('p')!)).toBe(false);
  });
});
