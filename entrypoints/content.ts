import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { startPolish, stopPolish } from '../utils/pipeline';

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

const MODAL_ID = 'text-polisher-modal';
let modalStyleInjected = false;

/** Inject a tiny stylesheet for the polishing modal (once). */
function ensureModalStyle(): void {
  if (modalStyleInjected) return;
  modalStyleInjected = true;
  const st = document.createElement('style');
  st.textContent =
    `#${MODAL_ID}{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483647;` +
    `display:flex;align-items:center;gap:10px;background:rgba(17,17,17,.82);color:#fff;padding:14px 22px;` +
    `border-radius:10px;font:600 15px/1 system-ui,-apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)}` +
    `#${MODAL_ID} .tpspin{width:16px;height:16px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;` +
    `border-radius:50%;animation:tpspin .7s linear infinite}` +
    `@keyframes tpspin{to{transform:rotate(360deg)}}`;
  (document.head || document.documentElement).appendChild(st);
}

/** Show a "Polishing…" modal overlay until the rewritten text has been injected. */
function showPolishingModal(): void {
  if (document.getElementById(MODAL_ID)) return;
  ensureModalStyle();
  const modal = document.createElement('div');
  modal.id = MODAL_ID;
  const spin = document.createElement('span');
  spin.className = 'tpspin';
  const label = document.createElement('span');
  label.textContent = 'Polishing…';
  modal.append(spin, label);
  document.body.appendChild(modal);
}

function hidePolishingModal(): void {
  document.getElementById(MODAL_ID)?.remove();
}

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  async main() {
    const dbg = (...args: unknown[]) => console.log('[Text Polisher content]', ...args);
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
    window.addEventListener('pagehide', () => {
      stopPolish();
      dbg('pagehide');
    });

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
          showPolishingModal();
          try {
            const result = await startPolish(window.location.hostname);
            dbg(
              'polish:',
              result.applied,
              'rewritten of',
              result.requested,
              'nodes across',
              result.blocks,
              'blocks; pending =',
              result.pending,
              '; notConfigured =',
              result.notConfigured,
            );
            sendResponse({
              ok: true,
              replaced: result.applied,
              blocks: result.blocks,
              pending: result.pending,
              notConfigured: result.notConfigured,
            });
          } finally {
            hidePolishingModal();
          }
        })();
        return true; // asynchronous sendResponse
      }
      return undefined;
    });

    // WebDriver-only automation bridge (e2e/Firefox Selenium harness). Never
    // active in real browsing: only when Firefox is under Selenium/geckodriver.
    if (navigator.webdriver) {
      const runPolish = () => {
        // Ack via a persistent DOM marker (events may not cross content/page worlds).
        document.documentElement.setAttribute('data-text-polisher-ack', 'true');
        showPolishingModal();
        void startPolish(window.location.hostname)
          .then((result) => {
            document.documentElement.setAttribute('data-text-polisher-done', JSON.stringify({ replaced: result.applied, requested: result.requested, blocks: result.blocks, notConfigured: result.notConfigured }));
          })
          .catch((err) => document.documentElement.setAttribute('data-text-polisher-err', String(err)))
          .finally(() => hidePolishingModal());
      };
      window.addEventListener('textpolisher:apply', runPolish);
      // WebDriver-only: seed the API key + optional full provider config. Reads
      // them from DOM attributes (which cross content/page worlds in Firefox),
      // then forwards to the background, which stores the same config
      // `getLlmConfig` reads.
      window.addEventListener('textpolisher:setkey', () => {
        const k = document.documentElement.getAttribute('data-seed-key');
        if (k && navigator.webdriver) {
          const cfgRaw = document.documentElement.getAttribute('data-seed-config');
          let config: unknown;
          try {
            config = cfgRaw ? JSON.parse(cfgRaw) : undefined;
          } catch {
            config = undefined;
          }
          void browser.runtime
            .sendMessage({ type: 'set-test-key', key: k, config } as never)
            .then(() => document.documentElement.setAttribute('data-seed-done', 'true'))
            .catch(() => document.documentElement.setAttribute('data-seed-done', 'err'));
        }
      });
      // Tell the harness the content script injected successfully (persistent
      // marker so a late-attaching Selenium can poll it).
      document.documentElement.setAttribute('data-text-polisher-injected', 'true');
    }
  },
});
