import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { PolishPipeline, type PipelineStatus } from '../utils/pipeline';
import { PROCESSED_ATTR } from '../utils/polish';
import { OVERLAY_CSS } from '../utils/overlayStyles';
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
 * - Drive the in-page overlay: a bottom-corner HUD (running "Polishing… N done"
 *   → done "N rewritten · Undo · ✕", no auto-hide) plus one-shot error toasts.
 */

/** Session-scoped guard key (design D5: state lives in storage.session). */
const SESSION_INIT_KEY = 'phase1:content-initialized';

const HUD_ID = 'text-polisher-hud';
const TOAST_ID = 'text-polisher-toast';
const TOAST_MS = 6000;
let overlayStyleInjected = false;

/** Inject the overlay stylesheet once (HUD, toast, highlight, pending). */
function ensureOverlayStyle(): void {
  if (overlayStyleInjected) return;
  overlayStyleInjected = true;
  const st = document.createElement('style');
  st.textContent = OVERLAY_CSS;
  (document.head || document.documentElement).appendChild(st);
}

interface HudElements {
  root: HTMLElement;
  label: HTMLElement;
  undoBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
}

let hud: HudElements | null = null;
let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** Create the HUD once; resolve to its parts. */
function ensureHud(): HudElements {
  if (hud && document.body.contains(hud.root)) return hud;
  ensureOverlayStyle();
  const root = document.createElement('div');
  root.id = HUD_ID;
  const label = document.createElement('span');
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'hud-undo';
  undoBtn.textContent = 'Undo';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'hud-close';
  closeBtn.textContent = '✕';
  root.append(label, undoBtn, closeBtn);
  document.body.appendChild(root);
  hud = { root, label, undoBtn, closeBtn };
  return hud;
}

function showHudRunning(done: number): void {
  const h = ensureHud();
  h.label.textContent = `Polishing… ${done} done`;
  h.undoBtn.hidden = true;
}

function showHudDone(applied: number): void {
  const h = ensureHud();
  h.label.textContent = `${applied} rewritten`;
  h.undoBtn.hidden = false;
}

function hideHud(): void {
  hud?.root.remove();
  hud = null;
}

/** Show a one-shot toast; the newest replaces any pending one. */
function showToast(message: string): void {
  if (!toastEl || !document.body.contains(toastEl)) {
    ensureOverlayStyle();
    toastEl = document.createElement('div');
    toastEl.id = TOAST_ID;
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('show');
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl?.classList.remove('show'), TOAST_MS);
}

/** True when the only failures were quality-gate rejections (keep silent). */
function onlyLowConfidence(errors: Record<string, number>): boolean {
  const kinds = Object.keys(errors);
  return kinds.length > 0 && kinds.every((k) => k === 'low-confidence');
}

/** Revert every rewrite of the last pass: text, highlights, processed marks. */
function undoPolish(pipe: PolishPipeline | null): void {
  if (!pipe) return;
  for (const rec of pipe.undoRecords) {
    rec.node.textContent = rec.original;
    const parent = rec.node.parentElement;
    if (parent) {
      parent.classList.remove('text-polished');
      parent.removeAttribute('title');
      parent.removeAttribute('data-confidence');
    }
    const marked = parent?.closest(`[${PROCESSED_ATTR}]`);
    marked?.removeAttribute(PROCESSED_ATTR);
  }
  hideHud();
  showToast('Rewrites reverted.');
}

/** Decide which toast (if any) the pass result deserves. */
function toastFor(requested: number, applied: number, notConfigured: boolean, errors: Record<string, number>): void {
  if (notConfigured) {
    showToast('Set an API key in Settings to polish text.');
  } else if (applied > 0 && applied < requested) {
    showToast(`Rewrote ${applied} of ${requested} — some text could not be rewritten.`);
  } else if (applied === 0 && requested > 0 && !onlyLowConfidence(errors)) {
    showToast('Could not rewrite text right now — try again.');
  }
}

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  async main() {
    const dbg = (...args: unknown[]) => console.log('[Text Polisher content]', ...args);
    dbg('content script loaded');

    /** Active pipeline for this page (toggle: start → pause → resume). */
    let pipeline: PolishPipeline | null = null;

    /** Forward lifecycle status to the background (icon) and drive the HUD. */
    const reportStatus = (status: PipelineStatus): void => {
      void browser.runtime.sendMessage({ type: 'polisher-status', status }).catch(() => {});
      if (status === 'done' && pipeline) {
        if (pipeline.appliedCount === 0 && pipeline.requestedCount === 0) {
          hideHud();
        } else {
          showHudDone(pipeline.appliedCount);
        }
      }
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
      hideHud();
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
        // Start a fresh pass; the HUD shows progress and the done state persists.
        pipeline?.stop();
        pipeline = new PolishPipeline(window.location.hostname, reportStatus, (done) => showHudRunning(done));
        const hudEl = ensureHud();
        hudEl.undoBtn.onclick = () => undoPolish(pipeline);
        hudEl.closeBtn.onclick = hideHud;
        showHudRunning(0);
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
            if (result.notConfigured) hideHud();
            toastFor(result.requested, result.applied, result.notConfigured, result.errors);
            sendResponse({
              ok: true,
              replaced: result.applied,
              blocks: result.blocks,
              pending: result.pending,
              notConfigured: result.notConfigured,
            } satisfies ApplyPolishResponse);
          })
          .catch(() => {
            hideHud();
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
