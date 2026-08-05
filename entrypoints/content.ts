import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { PolishPipeline, type PipelineStatus } from '../utils/pipeline';
import { PENDING_CLASS } from '../utils/polish';
import { isApplyPolishMessage, type ApplyPolishResponse } from '../utils/messages';

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

/** Session-scoped guard key (design D5: state lives in storage.session). */
const SESSION_INIT_KEY = 'phase1:content-initialized';

const MODAL_ID = 'text-polisher-modal';
const MODAL_AUTO_HIDE_MS = 5000;
let modalStyleInjected = false;

/** Inject a tiny stylesheet for the polishing modal and highlight badges (once). */
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
    `@keyframes tpspin{to{transform:rotate(360deg)}}` +
    `.text-polished[data-confidence]:not([data-confidence=""])::after{content:attr(data-confidence);` +
    `margin-left:5px;padding:1px 5px;border-radius:4px;` +
    `font:600 10px/1.4 system-ui,-apple-system,sans-serif;color:#0b57d0;background:rgba(11,87,208,.15)}` +
    `.text-polished{background-color:#cfe4f7!important;border-radius:2px!important}` +
    `.${PENDING_CLASS}{background-color:#e7e7ec!important;` +
    `background-image:repeating-linear-gradient(135deg,transparent 0 10px,#f6f6f8 10px 20px,transparent 20px 30px,#f6f6f8 30px 40px)!important;` +
    `animation:tp-scan 2.5s linear infinite!important}` +
    // Shift by exactly one horizontal period of the 135deg pattern (40px·√2 ≈
    // 56.57px) so the loop is seamless — animating by the gradient's own period
    // would make the stripes jump back at each loop.
    `@keyframes tp-scan{from{background-position:0 0}to{background-position:56.5685px 0}}`;
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

    /** Active pipeline for this page (toggle: start → pause → resume). */
    let pipeline: PolishPipeline | null = null;

    /** Forward lifecycle status to the background so it can update the icon. */
    const reportStatus = (status: PipelineStatus): void => {
      void browser.runtime.sendMessage({ type: 'polisher-status', status }).catch(() => {});
    };

    // 4.4: read per-navigation state from storage.session. Firefox keeps the
    // content script alive across same-tab navigation but drops window/module
    // globals, so persistent-ish state must live in storage.session (design D5).
    // Note: Firefox does not expose storage.session to content scripts, so this
    // silently degrades to "fresh session" there (the safe default).
    if (browser.storage.session) {
      try {
        const state = await browser.storage.session.get({ [SESSION_INIT_KEY]: false });
        dbg(state[SESSION_INIT_KEY] ? 'state restored from session storage' : 'fresh session state');
        await browser.storage.session.set({ [SESSION_INIT_KEY]: true });
      } catch (err) {
        dbg('storage.session unavailable:', err);
      }
    }

    // 4.4: reset per-navigation state on pageshow/pagehide.
    const resetSession = async () => {
      if (!browser.storage.session) return;
      try {
        await browser.storage.session.remove(SESSION_INIT_KEY);
      } catch {
        /* ignore */
      }
      dbg('reset session state on page lifecycle event');
    };
    window.addEventListener('pageshow', () => void resetSession());
    window.addEventListener('pagehide', () => {
      pipeline?.stop();
      pipeline = null;
      dbg('pagehide');
    });

    // 4.3: stub message round-trip to background (validates CORS-safe architecture).
    browser.runtime
      .sendMessage({ type: 'ping', payload: 'hello-from-content' })
      .then((reply) => dbg('background replied:', reply))
      .catch((err) => dbg('background reply failed:', err));

    // (explicit-apply-button): the popup's "Polish Page" button triggers this.
    // The click toggles: not started/done → start; running → pause; paused →
    // resume. Nothing runs on load, and a click without an API key is a no-op.
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isApplyPolishMessage(message)) return undefined;
      const st = pipeline?.state ?? 'idle';
      if (st === 'idle' || st === 'done') {
        // Start a fresh pass.
        pipeline?.stop();
        pipeline = new PolishPipeline(window.location.hostname, reportStatus);
        showPolishingModal();
        // The indicator is intentionally brief (user-experience spec): it
        // fades on its own even if a slow LLM call is still in flight, so the
        // user is never stuck staring at a spinner for a slow batch.
        const hideTimer = setTimeout(hidePolishingModal, MODAL_AUTO_HIDE_MS);
        pipeline
          .start()
          .then((result) => {
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
            clearTimeout(hideTimer);
            hidePolishingModal();
            sendResponse({
              ok: true,
              replaced: result.applied,
              blocks: result.blocks,
              pending: result.pending,
              notConfigured: result.notConfigured,
            } satisfies ApplyPolishResponse);
          })
          .catch(() => {
            clearTimeout(hideTimer);
            hidePolishingModal();
            sendResponse({ ok: false } satisfies ApplyPolishResponse);
          });
        return true; // asynchronous sendResponse
      }
      // Toggle pause/resume — the background icon reflects the new state.
      // (pipeline is non-null here: state is 'running' or 'paused'.)
      const active = pipeline as PolishPipeline;
      if (st === 'running') active.pause();
      else active.resume();
      sendResponse({ ok: true, state: active.state } satisfies ApplyPolishResponse);
      return; // synchronous response
    });

    // WebDriver-only automation bridge (e2e/Firefox Selenium harness). Never
    // active in production builds or real browsing; only when the build-time
    // flag VITE_ENABLE_TEST_BRIDGES is set and the browser reports webdriver.
    if (import.meta.env.VITE_ENABLE_TEST_BRIDGES === 'true' && navigator.webdriver) {
      const runPolish = () => {
        // Ack via a persistent DOM marker (events may not cross content/page worlds).
        document.documentElement.setAttribute('data-text-polisher-ack', 'true');
        pipeline?.stop();
        pipeline = new PolishPipeline(window.location.hostname, reportStatus);
        void pipeline
          .start()
          .then((result) => {
            document.documentElement.setAttribute('data-text-polisher-done', JSON.stringify({ replaced: result.applied, requested: result.requested, blocks: result.blocks, notConfigured: result.notConfigured }));
          })
          .catch((err) => document.documentElement.setAttribute('data-text-polisher-err', String(err)));
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
            .sendMessage({ type: 'set-test-key', key: k, config })
            .then(() => document.documentElement.setAttribute('data-seed-done', 'true'))
            .catch(() => document.documentElement.setAttribute('data-seed-done', 'err'));
        }
      });
      // Tell the harness the content script injected successfully (persistent
      // marker so a late-attaching Selenium can poll it).
      document.documentElement.setAttribute('data-text-polisher-injected', 'true');
    }

    // Toolbar icon starts in the "not started" state.
    reportStatus('idle');
  },
});
