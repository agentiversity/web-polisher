/**
 * Options page (generalize-llm-provider-model, refactored per action-button-popup).
 *
 * The provider/model/key wiring now lives in the shared `utils/configForm.ts`
 * controller (also used by the action popup). This page keeps its options-only
 * extras: the confidence threshold, the "Test connection" button, and provider /
 * model refresh buttons (wired through the shared controller's handles).
 *
 * The page reads/writes `browser.storage.local` and fetches the provider index
 * + model lists directly (an extension page has cross-origin fetch rights via
 * the manifest host permissions).
 */
import { browser } from 'wxt/browser';
import { initConfigForm, setStatus, type ConfigFormHandles } from '../../utils/configForm';
import { testConnection } from '../../utils/llmClient';

/** Wire the whole page. `doc`/`storage` injectable for jsdom tests. */
export async function initOptions(doc: Document, storage = browser.storage.local): Promise<void> {
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
    refreshProvidersBtn: el<HTMLButtonElement>('refresh-providers'),
    refreshModelsBtn: el<HTMLButtonElement>('refresh-models'),
  };
  const form = await initConfigForm(handles, storage);

  // Options-only: "Test connection" validates the current form state with a
  // minimal chat completion and never persists anything.
  el('test-connection').addEventListener('click', async () => {
    const cfg = form.collect();
    if ('error' in cfg) {
      setStatus(handles.status, cfg.error, 'err');
      return;
    }
    setStatus(handles.status, 'Testing connection…', '');
    const res = await testConnection(cfg);
    setStatus(handles.status, res.ok ? 'Connection OK — provider, model, and key work.' : `Connection failed (${res.reason}).`, res.ok ? 'ok' : 'err');
  });
}

// Top-level wiring (extension page); initOptions is exported for tests.
if (typeof document !== 'undefined' && document.getElementById('settings-form')) {
  void initOptions(document);
}
