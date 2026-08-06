/**
 * Action popup (action-button-popup, slimmed).
 *
 * Quick-action surface only: a large Polish button (start/pause/resume via the
 * existing apply-polish message), the current lifecycle status (from the
 * background's per-tab map, live-updated while the popup is open), and a link
 * to the options page. Configuration lives in the options page.
 */
import { browser } from 'wxt/browser';
import type { ApplyPolishMessage } from '../../utils/messages';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  running: 'Polishing…',
  paused: 'Paused',
  done: 'Done',
};

/** Wire the popup. `doc` injectable for jsdom tests. */
export async function initPopup(doc: Document): Promise<void> {
  const el = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const polish = el<HTMLButtonElement>('polish');
  const statusEl = el<HTMLElement>('status');
  const settingsBtn = el<HTMLButtonElement>('settings');

  const setStatus = (status: string): void => {
    statusEl.textContent = STATUS_LABEL[status] ?? status;
    statusEl.className = `status status-${status}`;
  };

  // Initial status: ask the background for the active tab's map entry.
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      const reply: unknown = await browser.runtime.sendMessage({ type: 'get-polisher-status', tabId: tab.id });
      if (reply && typeof reply === 'object' && (reply as { type?: string }).type === 'polisher-status-reply') {
        const status = (reply as { status?: string }).status;
        if (status) setStatus(status);
      }
    }
  } catch {
    // Background still waking up — keep the default Idle status.
  }

  // Live updates while the popup is open: the content script broadcasts
  // polisher-status via runtime.sendMessage, which reaches the popup too.
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (message && typeof message === 'object' && (message as { type?: string }).type === 'polisher-status') {
      const status = (message as { status?: string }).status;
      if (status) setStatus(status);
    }
  });

  settingsBtn.addEventListener('click', () => void browser.runtime.openOptionsPage());

  polish.addEventListener('click', () => {
    // Fire-and-forget and close immediately: polishing continues in the tab and
    // the toolbar icon reflects its progress. A missing content script is a
    // graceful no-op.
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id != null) {
        await browser.tabs.sendMessage(tab.id, { type: 'apply-polish' } satisfies ApplyPolishMessage).catch(() => {});
      }
    })();
    window.close();
  });
}

// Top-level wiring (extension popup); initPopup is exported for tests.
if (typeof document !== 'undefined' && document.getElementById('polish')) {
  void initPopup(document);
}
