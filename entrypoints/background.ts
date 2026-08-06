import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { transform, getLlmConfig } from '../utils/llmClient';
import { DEFAULT_GEMINI_MODEL, LLM_CONFIG_KEY, type LlmConfig } from '../utils/settings';
import type { PipelineStatus } from '../utils/pipeline';
import {
  isGetPolisherStatusMessage,
  isPingMessage,
  isPolisherStatusMessage,
  isTransformTextMessage,
  isSetTestKeyMessage,
  type ApplyPolishResponse,
  type PingResponse,
  type PolisherStatusReply,
  type SetTestKeyResponse,
  type TransformTextReply,
} from '../utils/messages';

/**
 * Text Polisher background service worker (design D4).
 *
 * In MV3 this is the only place that may make cross-origin requests (content
 * scripts are blocked by CORS). All LLM API calls route through here via the
 * `transform-text` message handled below. It also tracks each tab's polishing
 * status (reported by the content script) to drive the toolbar icon.
 */

/** Toolbar icon set per lifecycle status (gray=idle, blue=running, amber=paused, green=done). */
const STATUS_ICONS: Record<PipelineStatus, Record<string, string>> = {
  idle: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
  running: { 16: 'icon/16-running.png', 32: 'icon/32-running.png', 48: 'icon/48-running.png', 128: 'icon/128-running.png' },
  paused: { 16: 'icon/16-paused.png', 32: 'icon/32-paused.png', 48: 'icon/48-paused.png', 128: 'icon/128-paused.png' },
  done: { 16: 'icon/16-done.png', 32: 'icon/32-done.png', 48: 'icon/48-done.png', 128: 'icon/128-done.png' },
};

export default defineBackground(() => {
  console.debug('[Text Polisher] background service worker loaded');

  /** Per-tab polishing status; drives the action icon for the active tab. */
  const statusByTab = new Map<number, PipelineStatus>();

  function setIconForTab(tabId: number): void {
    const status = statusByTab.get(tabId) ?? 'idle';
    void browser.action.setIcon({ tabId, path: STATUS_ICONS[status] }).catch(() => {});
  }

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
      if (isPingMessage(message)) {
        console.debug('[Text Polisher] background received ping:', message.payload);
        sendResponse({ ok: true, echo: message.payload, from: 'background' } satisfies PingResponse);
        return;
      }

      // Content script reports its polishing lifecycle status → toolbar icon.
      if (isPolisherStatusMessage(message) && sender.tab?.id != null) {
        statusByTab.set(sender.tab.id, message.status as PipelineStatus);
        setIconForTab(sender.tab.id);
        return;
      }

      // Popup asks for the active tab's status on open.
      if (isGetPolisherStatusMessage(message)) {
        sendResponse({
          type: 'polisher-status-reply',
          status: statusByTab.get(message.tabId) ?? 'idle',
        } satisfies PolisherStatusReply);
        return;
      }

      if (isTransformTextMessage(message)) {
        const texts = message.texts;
        const notConfiguredPromise = getLlmConfig().then((c) => c === undefined);
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

      // TEST-ONLY (Selenium harness): store a config the way the app reads it.
      // Stripped from production builds; only enabled when the build-time flag
      // VITE_ENABLE_TEST_BRIDGES is set. Accepts an optional full config
      // (providerId/baseUrl/compat/model); the API key always comes from the
      // message. Defaults to a Gemini config.
      if (
        import.meta.env.VITE_ENABLE_TEST_BRIDGES === 'true' &&
        sender.id === browser.runtime.id &&
        isSetTestKeyMessage(message)
      ) {
        void (async () => {
          try {
            const key = message.key;
            const cfg = message.config;
            const llmConfig: LlmConfig =
              cfg && typeof cfg === 'object'
                ? ({ ...(cfg as LlmConfig), apiKey: key })
                : {
                    providerId: 'google',
                    baseUrl: 'https://generativelanguage.googleapis.com',
                    apiCompatibility: 'gemini',
                    model: DEFAULT_GEMINI_MODEL,
                    apiKey: key,
                  };
            await browser.storage.local.set({ [LLM_CONFIG_KEY]: llmConfig });
            sendResponse({ ok: true } satisfies SetTestKeyResponse);
          } catch {
            sendResponse({ ok: false } satisfies SetTestKeyResponse);
          }
        })();
        return true;
      }

      // Return undefined (and don't call sendResponse) for unhandled messages.
      return undefined;
    });

  // Keep the active tab's icon in sync as the user switches tabs, and reset to
  // "not started" when a tab starts navigating.
  browser.tabs.onActivated.addListener((info) => setIconForTab(info.tabId));
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      statusByTab.delete(tabId);
      setIconForTab(tabId);
    }
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    statusByTab.delete(tabId);
  });
  });
