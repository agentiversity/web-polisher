// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSiteProfile,
  isExcluded,
  isUserContentElement,
  findUserContentRoots,
} from './contentDetector';

function setup(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe('contentDetector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('getSiteProfile', () => {
    it('matches base and subdomains', () => {
      expect(getSiteProfile('reddit.com')).toBeDefined();
      expect(getSiteProfile('www.reddit.com')).toBeDefined();
      expect(getSiteProfile('old.reddit.com')).toBeDefined();
      expect(getSiteProfile('facebook.com')).toBeDefined();
    });

    it('does not match unrelated hosts', () => {
      expect(getSiteProfile('google.com')).toBeUndefined();
      expect(getSiteProfile('')).toBeUndefined();
      expect(getSiteProfile(undefined)).toBeUndefined();
    });
  });

  describe('isExcluded', () => {
    it('excludes native buttons, links, nav', () => {
      setup('<button id="b"></button><a id="l"></a><nav id="n"></nav>');
      expect(isExcluded(document.getElementById('b')!)).toBe(true);
      expect(isExcluded(document.getElementById('l')!)).toBe(true);
      expect(isExcluded(document.getElementById('n')!)).toBe(true);
    });

    it('excludes interactive roles', () => {
      setup('<div role="button" id="rb"></div><div role="navigation" id="rn"></div>');
      expect(isExcluded(document.getElementById('rb')!)).toBe(true);
      expect(isExcluded(document.getElementById('rn')!)).toBe(true);
    });

    it('excludes non-<button> focusable wrappers (Reddit finding)', () => {
      setup('<div tabindex="0" id="w">Share</div>');
      expect(isExcluded(document.getElementById('w')!)).toBe(true);
    });

    it('excludes elements inside an excluded ancestor', () => {
      setup('<nav><div><span id="s">Home</span></div></nav>');
      expect(isExcluded(document.getElementById('s')!)).toBe(true);
    });

    it('excludes ad regions', () => {
      setup('<aside id="a"></aside><div class="sponsor" id="s"></div>');
      expect(isExcluded(document.getElementById('a')!)).toBe(true);
      expect(isExcluded(document.getElementById('s')!)).toBe(true);
    });

    it('does not exclude plain content blocks', () => {
      setup('<article id="ar"><p>some user text</p></article>');
      expect(isExcluded(document.getElementById('ar')!)).toBe(false);
    });

    it('does not exclude content just because it carries aria-label (Reddit)', () => {
      // Reddit stamps aria-labels on post/comment containers; a bare aria-label
      // must not be treated as interactive/UI.
      setup(
        '<article aria-label="a post title"><p>some real user post body text here that is plenty long</p></article>',
      );
      const art = document.querySelector('article')!;
      expect(isExcluded(art)).toBe(false);
      expect(isUserContentElement(art)).toBe(true);
    });

    it('excludes hidden / screen-reader content', () => {
      setup(
        '<div aria-hidden="true"><p>hidden screen reader only text here</p></div><div><p>visible real comment text here</p></div>',
      );
      const vis = document.querySelectorAll('p')[1]!;
      const hidden = document.querySelectorAll('p')[0]!;
      expect(isExcluded(hidden)).toBe(true);
      expect(isExcluded(vis)).toBe(false);
    });
  });

  describe('isUserContentElement', () => {
    it('accepts generic positive roles', () => {
      setup('<article id="ar">a user post with some content here</article>');
      expect(isUserContentElement(document.getElementById('ar')!)).toBe(true);
    });

    it('rejects excluded elements even if role is positive', () => {
      setup('<div role="article" id="d"><button>Reply</button></div>');
      // role=article is a positive signal, but it contains a button region -> the
      // descendant button itself is excluded; the article div is not interactive.
      const btn = document.getElementById('d')!.querySelector('button')!;
      expect(isExcluded(btn)).toBe(true);
    });

    it('heuristic fallback accepts long low-interactivity text on unknown sites', () => {
      setup(
        '<div id="c">This is a fairly long user comment with enough words to be considered user-generated content for the heuristic path.</div>',
      );
      expect(isUserContentElement(document.getElementById('c')!)).toBe(true);
    });

    it('heuristic rejects nav-like containers with many links', () => {
      setup(
        '<div id="n"><a>1</a><a>2</a><a>3</a><a>4</a><a>5</a>long text that would otherwise pass but has too many links</div>',
      );
      expect(isUserContentElement(document.getElementById('n')!)).toBe(false);
    });
  });

  describe('findUserContentRoots', () => {
    it('pierces shadow DOM to find content roots inside shreddit hosts', () => {
      // Simulate www.reddit.com: a shreddit-comment host whose visible body text
      // lives in its shadow root (the pre-fix behavior only saw the light DOM).
      const host = document.createElement('shreddit-comment');
      const shadow = host.attachShadow({ mode: 'open' });
      const body = document.createElement('p');
      body.textContent = 'this is the real visible comment body inside shadow DOM';
      shadow.append(body);
      document.body.append(host);
      const roots = findUserContentRoots(document.body, 'www.reddit.com');
      expect(roots.length).toBe(1);
      expect(roots[0]!.tagName.toLowerCase()).toBe('shreddit-comment');
    });

    it('collects top-most comment blocks and skips buttons on Reddit', () => {
      setup(`
        <div class="Comment"><p>first real user comment with plenty of text that is long enough to detect</p></div>
        <button>Reply</button>
        <div role="button">Share</div>
        <div class="Comment"><p>another real user comment with plenty of text that is long enough</p></div>
      `);
      const roots = findUserContentRoots(document.body, 'reddit.com');
      expect(roots.length).toBe(2);
      expect(roots.every((r) => r.classList.contains('Comment'))).toBe(true);
    });

    it('does not double-count nested content (returns top-most roots)', () => {
      setup(
        '<div class="Comment"><div class="md"><p>a nested user comment body text that is long enough to detect</p></div></div>',
      );
      const roots = findUserContentRoots(document.body, 'reddit.com');
      expect(roots.length).toBe(1);
    });

    it('heuristically detects content on unknown sites', () => {
      setup(
        '<div id="c">A long user-generated post with enough trailing text to be recognized as content by heuristic scoring.</div>',
      );
      const roots = findUserContentRoots(document.body, 'unknown.example.com');
      expect(roots.some((r) => r.id === 'c')).toBe(true);
    });
  });
});
