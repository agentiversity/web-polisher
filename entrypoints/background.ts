import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { transform, getApiKey } from '../utils/llmClient';

/**
 * Text Polisher background service worker (design D4).
 *
 * In MV3 this is the only place that may make cross-origin requests (content
 * scripts are blocked by CORS). All LLM API calls route through here via the
 * `transform-text` message handled below.
 */

export interface PingMessage {
  type: 'ping';
  payload?: unknown;
}

export interface PingResponse {
  ok: true;
  echo: unknown;
  from: 'background';
}

/** Message the background sends to a tab's content script to apply polishing. */
export interface ApplyPolishMessage {
  type: 'apply-polish';
}

/** Message the content script sends to the background to transform a batch. */
export interface TransformTextMessage {
  type: 'transform-text';
  texts: string[];
}

export interface TransformTextReply {
  type: 'transform-text-result';
  results: { ok: boolean; text: string; error?: string }[];
  /** True when no API key is set — content script should do nothing. */
  notConfigured: boolean;
}

export default defineBackground(() => {
  console.debug('[Text Polisher] background service worker loaded');

    // Toolbar action button (user-actions). Clicking applies polishing to the
    // active page by forwarding an apply-polish message to that tab's content
    // script. `action.onClicked` is a user gesture, which grants `activeTab`
    // access to the clicked tab (design D2).
    browser.action.onClicked.addListener((tab) => {
      if (typeof tab.id === 'number') {
        browser.tabs
          .sendMessage(tab.id, { type: 'apply-polish' } satisfies ApplyPolishMessage)
          .then((reply) => console.debug('[Text Polisher] applied polish, reply:', reply))
          .catch((err) =>
            // Active tab may have no content script (e.g. about:/restricted); log, don't crash.
            console.debug('[Text Polisher] could not apply polish to tab:', err),
          );
      }
    });

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (message && typeof message === 'object' && (message as PingMessage).type === 'ping') {
        const payload = (message as PingMessage).payload;
        console.debug('[Text Polisher] background received ping:', payload);
        sendResponse({ ok: true, echo: payload, from: 'background' } satisfies PingResponse);
        return;
      }

      if (
        message &&
        typeof message === 'object' &&
        (message as TransformTextMessage).type === 'transform-text' &&
        Array.isArray((message as TransformTextMessage).texts)
      ) {
        const texts = (message as TransformTextMessage).texts.slice(0, 2000);
        const notConfiguredPromise = getApiKey().then((k) => k === undefined);
        void (async () => {
          try {
            const results = await transform(texts);
            const notConfigured = await notConfiguredPromise;
            sendResponse({
              type: 'transform-text-result',
              results,
              notConfigured,
            } satisfies TransformTextReply);
          } catch (err) {
            // Defensive: never leave the content script hanging.
            console.error('[Text Polisher] transform-text failed:', err);
            sendResponse({ type: 'transform-text-result', results: [], notConfigured: false });
          }
        })();
        return true; // asynchronous sendResponse
      }

      // Return undefined (and don't call sendResponse) for unhandled messages.
      return undefined;
    });
  });
