import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { replaceTextNodes, markProcessed } from '../utils/textReplacer';
import { findUserContentRoots } from '../utils/contentDetector';

/**
 * Text Polisher content script.
 *
 * Phase 1 responsibilities:
 * - 4.2  Run at `document_idle`.
 * - 4.3  Stub message round-trip to the background service worker (content →
 *        background → content) validating the CORS-safe architecture.
 * - 4.4  Keep per-navigation state in `browser.storage.session` and reset on
 *        `pageshow`/`pagehide` (Firefox content-script lifecycle, Pitfall #11 /
 *        bug 1525400 — the script survives navigation but drops globals).
 * - (explicit-apply-button) Respond to an `apply-polish` message from the
 *        background (triggered by the toolbar action button) by running the
 *        replacer. Nothing is applied on page load.
 *
 * NOTE: The placeholder transform below is a Phase 1 PROOF OF MECHANICS only.
 * It is NOT the production transformation — that arrives in Phase 3 (LLM). It
 * should be tuned during the real-site spike.
 */

/** Session-scoped guard key (design D5: state lives in storage.session). */
const SESSION_INIT_KEY = 'phase1:content-initialized';

/** Deterministic placeholder transform for Phase 1 verification. */
function placeholderTransform(text: string): string {
  return `[text-polisher] ${text}`;
}

/** Message type received from the background when the user clicks the action button. */
interface ApplyPolishMessage {
  type: 'apply-polish';
}

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  async main() {
    const dbg = (...args: unknown[]) => console.debug('[Text Polisher content]', ...args);
    dbg('content script loaded');

    // 4.4: read per-navigation state from storage.session. Firefox keeps the
    // content script alive across same-tab navigation but drops window/module
    // globals, so persistent-ish state must live in storage.session (design D5).
    try {
      const state = await browser.storage.session.get({ [SESSION_INIT_KEY]: false });
      dbg(state[SESSION_INIT_KEY] ? 'state restored from session storage' : 'fresh session state');
      await browser.storage.session.set({ [SESSION_INIT_KEY]: true });
    } catch (err) {
      dbg('storage.session unavailable:', err);
    }

    // 4.4: reset per-navigation state on pageshow/pagehide.
    const resetSession = async () => {
      try {
        await browser.storage.session.remove(SESSION_INIT_KEY);
      } catch {
        /* ignore */
      }
      dbg('reset session state on page lifecycle event');
    };
    window.addEventListener('pageshow', () => void resetSession());
    window.addEventListener('pagehide', () => dbg('pagehide'));

    // 4.3: stub message round-trip to background (validates CORS-safe architecture).
    browser.runtime
      .sendMessage({ type: 'ping', payload: 'hello-from-content' })
      .then((reply) => dbg('background replied:', reply))
      .catch((err) => dbg('background reply failed:', err));

    // (explicit-apply-button): respond to the toolbar action button. The
    // background forwards an apply-polish message when the user clicks the
    // action button. We only run the replacer in response — nothing runs on load.
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (
        message &&
        typeof message === 'object' &&
        (message as ApplyPolishMessage).type === 'apply-polish'
      ) {
        if (document.body) {
          // Phase 2: run content detection first, then replace only within detected
          // user-content roots (no UI/nav/ads, no button wrappers).
          const roots = findUserContentRoots(document.body, window.location.hostname);
          let replaced = 0;
          for (const root of roots) {
            replaced += replaceTextNodes(root, {
              minLength: 12,
              transform: placeholderTransform,
            });
            // Mark the root processed so later passes skip already-visited text
            // (duplicate-prevention proof; granular marking lands in Phase 4).
            markProcessed(root);
          }
          dbg('applied polish to', replaced, 'text nodes across', roots.length, 'content blocks');
          sendResponse({ ok: true, replaced, blocks: roots.length });
        } else {
          sendResponse({ ok: false, reason: 'no body' });
        }
        return;
      }
      return undefined;
    });
  },
});
