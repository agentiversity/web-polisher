/**
 * Options page (generalize-llm-provider-model).
 *
 * Provider dropdown (custom first, then alphabetical well-known providers) →
 * model dropdown (cached live-fetch, remote-index, or bundled suggestions) or
 * free-text model id → API key. Saves one config under `llm:config`, with the
 * confidence threshold alongside. "Test connection" validates the current form
 * with a minimal chat completion and never persists.
 *
 * The page reads/writes `browser.storage.local` and fetches the provider index
 * + model lists directly (an extension page has cross-origin fetch rights via
 * the manifest host permissions).
 */
import { browser } from 'wxt/browser';
import {
  CONFIDENCE_THRESHOLD_KEY,
  LLM_CONFIG_KEY,
  type ApiCompatibility,
  type LlmConfig,
} from '../../utils/settings';
import {
  clearProviderIndexCache,
  fetchProviderIndex,
  getProviderById,
  getProviderModels,
  type ProviderDef,
} from '../../utils/providers';
import { buildConfig, normalizeThreshold, providerOptions } from '../../utils/optionsModel';
import { testConnection } from '../../utils/llmClient';

/** All DOM handles + page state, resolved by initOptions so tests can inject a jsdom. */
interface Page {
  form: HTMLFormElement;
  provider: HTMLSelectElement;
  refreshProviders: HTMLButtonElement;
  customFields: HTMLElement;
  customName: HTMLInputElement;
  customUrl: HTMLInputElement;
  customCompat: HTMLSelectElement;
  modelSelect: HTMLSelectElement;
  modelInput: HTMLInputElement;
  refreshModels: HTMLButtonElement;
  apiKey: HTMLInputElement;
  threshold: HTMLInputElement;
  testBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  status: HTMLParagraphElement;
  providers: ProviderDef[];
  modelMode: 'dropdown' | 'text';
}

function setStatus(p: Page, message: string, kind: 'ok' | 'err' | '' = ''): void {
  p.status.textContent = message;
  p.status.className = `status ${kind}`;
}

function selectedCompat(p: Page): ApiCompatibility {
  return p.provider.value === 'custom'
    ? (p.customCompat.value as ApiCompatibility)
    : (getProviderById(p.providers, p.provider.value)?.apiCompatibility ?? 'gemini');
}

function fillSelect(select: HTMLSelectElement, options: { value: string; label: string }[], selected?: string): void {
  select.replaceChildren(
    ...options.map((o) => {
      const el = document.createElement('option');
      el.value = o.value;
      el.textContent = o.label;
      if (o.value === selected) el.selected = true;
      return el;
    }),
  );
}

function renderProviders(p: Page, selectedId?: string): void {
  fillSelect(p.provider, providerOptions(p.providers), selectedId ?? p.provider.value);
}

/** Populate the model control for the current provider; free-text when no list. */
async function updateModelControl(p: Page, force = false): Promise<void> {
  const compat = selectedCompat(p);
  p.modelSelect.hidden = true;
  p.modelInput.hidden = true;
  p.modelInput.value = '';
  const apiKey = p.apiKey.value.trim() || undefined;

  let models: string[] | undefined;
  if (p.provider.value === 'custom') {
    const url = p.customUrl.value.trim();
    if (url && apiKey) {
      models = await getProviderModels(
        { id: 'custom', name: 'custom', baseUrl: url, apiCompatibility: compat },
        apiKey,
        force,
      );
    }
  } else {
    const provider = getProviderById(p.providers, p.provider.value);
    if (provider) models = await getProviderModels(provider, apiKey, force);
  }

  if (models && models.length > 0) {
    fillSelect(p.modelSelect, models.map((m) => ({ value: m, label: m })));
    p.modelSelect.hidden = false;
    p.modelInput.hidden = true;
    p.modelMode = 'dropdown';
  } else {
    p.modelSelect.hidden = true;
    p.modelInput.hidden = false;
    p.modelMode = 'text';
  }
}

function onProviderChange(p: Page): void {
  const custom = p.provider.value === 'custom';
  p.customFields.hidden = !custom;
  void updateModelControl(p);
}

function collect(p: Page): LlmConfig | { error: string } {
  return buildConfig({
    providerId: p.provider.value,
    customName: p.customName.value,
    customUrl: p.customUrl.value,
    customCompat: p.customCompat.value as ApiCompatibility,
    model: p.modelMode === 'dropdown' ? p.modelSelect.value : p.modelInput.value,
    modelFromList: p.modelMode === 'dropdown',
    apiKey: p.apiKey.value,
    providers: p.providers,
  });
}

function resetForm(p: Page): void {
  p.provider.value = 'custom';
  p.customFields.hidden = true;
  p.modelInput.value = '';
  p.modelSelect.replaceChildren();
  p.apiKey.value = '';
  p.threshold.value = String(normalizeThreshold(NaN));
  p.modelMode = 'text';
  void updateModelControl(p);
}

async function loadSaved(p: Page): Promise<void> {
  try {
    const got = await browser.storage.local.get({ [LLM_CONFIG_KEY]: null, [CONFIDENCE_THRESHOLD_KEY]: null });
    const cfg = got[LLM_CONFIG_KEY] as Partial<LlmConfig> | undefined;
    const threshold = got[CONFIDENCE_THRESHOLD_KEY];
    p.threshold.value = String(normalizeThreshold(typeof threshold === 'number' ? threshold : Number(threshold) || NaN));
    if (cfg && typeof cfg === 'object' && typeof cfg.model === 'string' && typeof cfg.apiKey === 'string') {
      renderProviders(p, cfg.providerId ?? 'custom');
      if (cfg.providerId === 'custom') {
        p.customName.value = cfg.customName ?? '';
        p.customUrl.value = cfg.baseUrl ?? '';
        p.customCompat.value = (cfg.apiCompatibility ?? 'openai') as ApiCompatibility;
        p.customFields.hidden = false;
      }
      p.apiKey.value = cfg.apiKey;
      await updateModelControl(p);
      if (p.modelMode === 'dropdown') {
        const list = [...p.modelSelect.options].map((o) => o.value);
        if (list.some((m) => m === cfg.model)) {
          p.modelSelect.value = cfg.model;
        } else {
          p.modelMode = 'text';
          p.modelSelect.hidden = true;
          p.modelInput.hidden = false;
          p.modelInput.value = cfg.model;
        }
      } else {
        p.modelInput.value = cfg.model;
      }
      setStatus(p, 'Saved configuration loaded.', 'ok');
    }
  } catch {
    setStatus(p, 'Could not read saved settings.', 'err');
  }
}

/** Wire the whole page. `doc`/`storage` injectable for jsdom tests. */
export async function initOptions(doc: Document, storage = browser.storage.local): Promise<void> {
  const el = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const p: Page = {
    form: el('settings-form'),
    provider: el('provider'),
    refreshProviders: el('refresh-providers'),
    customFields: el('custom-fields'),
    customName: el('custom-name'),
    customUrl: el('custom-url'),
    customCompat: el('custom-compat'),
    modelSelect: el('model-select'),
    modelInput: el('model-input'),
    refreshModels: el('refresh-models'),
    apiKey: el('api-key'),
    threshold: el('confidence-threshold'),
    testBtn: el('test-connection'),
    clearBtn: el('clear'),
    status: el('status'),
    providers: [],
    modelMode: 'text',
  };

  p.providers = await fetchProviderIndex();
  renderProviders(p);

  p.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cfg = collect(p);
    if ('error' in cfg) {
      setStatus(p, cfg.error, 'err');
      return;
    }
    try {
      await storage.set({
        [LLM_CONFIG_KEY]: cfg,
        [CONFIDENCE_THRESHOLD_KEY]: normalizeThreshold(Number(p.threshold.value)),
      });
      setStatus(p, 'Saved.', 'ok');
    } catch {
      setStatus(p, 'Could not save settings.', 'err');
    }
  });

  p.testBtn.addEventListener('click', async () => {
    const cfg = collect(p);
    if ('error' in cfg) {
      setStatus(p, cfg.error, 'err');
      return;
    }
    setStatus(p, 'Testing connection…', '');
    const res = await testConnection(cfg);
    setStatus(p, res.ok ? 'Connection OK — provider, model, and key work.' : `Connection failed (${res.reason}).`, res.ok ? 'ok' : 'err');
  });

  p.clearBtn.addEventListener('click', async () => {
    try {
      await storage.remove(LLM_CONFIG_KEY);
    } catch {
      /* ignore */
    }
    resetForm(p);
    setStatus(p, 'Cleared. Transformation is now disabled.', 'ok');
  });

  p.refreshProviders.addEventListener('click', async () => {
    await clearProviderIndexCache();
    p.providers = await fetchProviderIndex();
    renderProviders(p);
    onProviderChange(p);
    setStatus(p, 'Providers refreshed.', 'ok');
  });

  p.refreshModels.addEventListener('click', () => {
    void updateModelControl(p, true).then(() => setStatus(p, 'Models refreshed.', 'ok'));
  });

  p.provider.addEventListener('change', () => onProviderChange(p));
  p.customCompat.addEventListener('change', () => void updateModelControl(p));

  await loadSaved(p);
}

// Top-level wiring (extension page); initOptions is exported for tests.
if (typeof document !== 'undefined' && document.getElementById('settings-form')) {
  void initOptions(document);
}
