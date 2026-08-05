/**
 * Action popup (action-button-popup).
 *
 * Opens when the user clicks the toolbar action button (WXT wires the popup as
 * `action.default_popup`). Top: a large, central, icon-only "Polish Page"
 * button (tooltip via `title`). Below: the shared provider/model/API-key config
 * form (`utils/configForm.ts`), so the user can adjust configuration right
 * before polishing. Clicking "Polish Page" sends the existing `apply-polish`
 * message to the active tab and closes the popup.
 */
import { browser } from 'wxt/browser';
import { initConfigForm, type ConfigFormHandles } from '../../utils/configForm';
import type { ApplyPolishMessage } from '../../utils/messages';

/** Wire the popup. `doc`/`storage` injectable for jsdom tests. */
export async function initPopup(doc: Document, storage = browser.storage.local): Promise<void> {
  const el = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const handles: ConfigFormHandles = {
    form: el('settings-form'),
    provider: el('provider'),
    customFields: el('custom-fields'),
    customName: el('custom-name'),
    customUrl: el('custom-url'),
    customCompat: el('custom-compat'),
    modelSelect: el('model-select'),
    modelInput: el('model-input'),
    apiKey: el('api-key'),
    status: el('status'),
    threshold: el<HTMLInputElement>('confidence-threshold'),
    clearBtn: el<HTMLButtonElement>('clear'),
  };
  await initConfigForm(handles, storage);

  el<HTMLButtonElement>('polish').addEventListener('click', () => {
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
if (typeof document !== 'undefined' && document.getElementById('settings-form')) {
  void initPopup(document);
}
