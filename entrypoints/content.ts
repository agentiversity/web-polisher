import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { polishContent } from '../utils/polish';

/**
 * Text Polisher content script.
 *
 * Responsibilities:
 * - Run at `document_idle`.
 * - Keep per-navigation state in `browser.storage.session` and reset on
 *   `pageshow`/`pagehide` (Firefox content-script lifecycle, Pitfall #11 /
 *   bug 1525400 — the script survives navigation but drops globals).
 * - Respond to an `apply-polish` message from the background (triggered by the
 *   toolbar action button) by running the LLM-backed transform. Nothing is
 *   applied on page load; a click with no API key is a graceful no-op.
 */

/** Message type received from the background when the user clicks the action button. */
interface ApplyPolishMessage {
  type: 'apply-polish';
}

/** Session-scoped guard key (design D5: state lives in storage.session). */
const SESSION_INIT_KEY = 'phase1:content-initialized';

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
    // action button. We run the LLM-backed polish in response — nothing runs on
    // load, and a click without an API key is a graceful no-op.
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (
        message &&
        typeof message === 'object' &&
        (message as ApplyPolishMessage).type === 'apply-polish'
      ) {
        void (async () => {
          const result = await polishContent(window.location.hostname);
          dbg(
            'polish:',
            result.applied,
            'rewritten of',
            result.requested,
            'nodes across',
            result.blocks,
            'blocks; notConfigured =',
            result.notConfigured,
          );
          sendResponse({
            ok: true,
            replaced: result.applied,
            blocks: result.blocks,
            notConfigured: result.notConfigured,
          });
        })();
        return true; // asynchronous sendResponse
      }
      return undefined;
    });
  },
});
