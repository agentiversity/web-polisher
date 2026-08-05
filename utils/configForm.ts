/**
 * Shared provider/model/key configuration form controller (action-button-popup).
 *
 * Both the options page and the action popup render the same provider → model →
 * API key controls. This module owns that shared wiring — render providers
 * (custom first), toggle custom fields, update the model dropdown vs free-text,
 * collect/validate via `buildConfig`, and save/clear in `storage.local` — so the
 * two surfaces never drift. Page-specific controls (confidence threshold,
 * "Test connection", refresh buttons) stay in the calling page.
 */
import { browser } from 'wxt/browser';
import {
  CONFIDENCE_THRESHOLD_KEY,
  LLM_CONFIG_KEY,
  type ApiCompatibility,
  type LlmConfig,
} from './settings';
import {
  clearProviderIndexCache,
  fetchProviderIndex,
  getProviderById,
  getProviderModels,
  type ProviderDef,
} from './providers';
import { buildConfig, normalizeThreshold, providerOptions } from './optionsModel';
import { buildDefaults, type BuildDefaults } from './buildDefaults';

/** DOM handles the shared controller operates on. */
export interface ConfigFormHandles {
  form: HTMLFormElement;
  provider: HTMLSelectElement;
  customFields: HTMLElement;
  customName: HTMLInputElement;
  customUrl: HTMLInputElement;
  customCompat: HTMLSelectElement;
  modelSelect: HTMLSelectElement;
  modelInput: HTMLInputElement;
  apiKey: HTMLInputElement;
  status: HTMLElement;
  /** Options page only: confidence threshold input. */
  threshold?: HTMLInputElement;
  clearBtn?: HTMLButtonElement;
  refreshProvidersBtn?: HTMLButtonElement;
  refreshModelsBtn?: HTMLButtonElement;
}

export interface ConfigFormController {
  /** Build a validated config from the current form state; `{ error }` when invalid. */
  collect(): LlmConfig | { error: string };
  /** Validate and persist the form (llm:config + optional threshold); true on success. */
  save(): Promise<boolean>;
  /** Remove the stored config and reset the form. */
  clear(): Promise<void>;
  /** Re-fetch the well-known providers list. */
  refreshProviders(): Promise<void>;
  /** Re-fetch the selected provider's model list. */
  refreshModels(): Promise<void>;
}

/** Set a status line's text and kind ('' | 'ok' | 'err'). */
export function setStatus(el: HTMLElement, message: string, kind: 'ok' | 'err' | '' = ''): void {
  el.textContent = message;
  el.className = `status ${kind}`;
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

function selectedCompat(h: ConfigFormHandles, providers: ProviderDef[]): ApiCompatibility {
  return h.provider.value === 'custom'
    ? (h.customCompat.value as ApiCompatibility)
    : (getProviderById(providers, h.provider.value)?.apiCompatibility ?? 'gemini');
}

function renderProviders(h: ConfigFormHandles, providers: ProviderDef[], selectedId?: string): void {
  fillSelect(h.provider, providerOptions(providers), selectedId ?? h.provider.value);
}

/**
 * Initialize the shared config form controller. Resolves once the provider list
 * is loaded and the saved config is reflected in the controls.
 */
export async function initConfigForm(
  h: ConfigFormHandles,
  storage = browser.storage.local,
): Promise<ConfigFormController> {
  let providers: ProviderDef[] = [];
  let modelMode: 'dropdown' | 'text' = 'text';

  /** Populate the model control for the current provider; free-text when no list. */
  async function updateModelControl(force = false): Promise<void> {
    const compat = selectedCompat(h, providers);
    h.modelSelect.hidden = true;
    h.modelInput.hidden = true;
    h.modelInput.value = '';
    const apiKey = h.apiKey.value.trim() || undefined;

    let models: string[] | undefined;
    if (h.provider.value === 'custom') {
      const url = h.customUrl.value.trim();
      if (url && apiKey) {
        models = await getProviderModels(
          { id: 'custom', name: 'custom', baseUrl: url, apiCompatibility: compat },
          apiKey,
          force,
        );
      }
    } else {
      const provider = getProviderById(providers, h.provider.value);
      if (provider) models = await getProviderModels(provider, apiKey, force);
    }

    if (models && models.length > 0) {
      fillSelect(h.modelSelect, models.map((m) => ({ value: m, label: m })));
      h.modelSelect.hidden = false;
      h.modelInput.hidden = true;
      modelMode = 'dropdown';
    } else {
      h.modelSelect.hidden = true;
      h.modelInput.hidden = false;
      modelMode = 'text';
    }
  }

  function onProviderChange(): void {
    const custom = h.provider.value === 'custom';
    h.customFields.hidden = !custom;
    void updateModelControl();
  }

  function collect(): LlmConfig | { error: string } {
    return buildConfig({
      providerId: h.provider.value,
      customName: h.customName.value,
      customUrl: h.customUrl.value,
      customCompat: h.customCompat.value as ApiCompatibility,
      model: modelMode === 'dropdown' ? h.modelSelect.value : h.modelInput.value,
      modelFromList: modelMode === 'dropdown',
      apiKey: h.apiKey.value,
      providers,
    });
  }

  async function save(): Promise<boolean> {
    const cfg = collect();
    if ('error' in cfg) {
      setStatus(h.status, cfg.error, 'err');
      return false;
    }
    try {
      const payload: Record<string, unknown> = { [LLM_CONFIG_KEY]: cfg };
      if (h.threshold) payload[CONFIDENCE_THRESHOLD_KEY] = normalizeThreshold(Number(h.threshold.value));
      await storage.set(payload);
      setStatus(h.status, 'Saved.', 'ok');
      return true;
    } catch {
      setStatus(h.status, 'Could not save settings.', 'err');
      return false;
    }
  }

  function resetForm(): void {
    h.provider.value = 'custom';
    h.customFields.hidden = true;
    h.modelInput.value = '';
    h.modelSelect.replaceChildren();
    h.apiKey.value = '';
    if (h.threshold) h.threshold.value = String(normalizeThreshold(NaN));
    modelMode = 'text';
    void updateModelControl();
  }

  async function clear(): Promise<void> {
    try {
      await storage.remove(LLM_CONFIG_KEY);
    } catch {
      /* ignore */
    }
    resetForm();
    setStatus(h.status, 'Cleared. Transformation is now disabled.', 'ok');
  }

  async function refreshProviders(): Promise<void> {
    await clearProviderIndexCache();
    providers = await fetchProviderIndex();
    renderProviders(h, providers);
    onProviderChange();
    setStatus(h.status, 'Providers refreshed.', 'ok');
  }

  async function refreshModels(): Promise<void> {
    await updateModelControl(true);
    setStatus(h.status, 'Models refreshed.', 'ok');
  }

  async function loadSaved(): Promise<void> {
    let cfg: Partial<LlmConfig> | undefined;
    try {
      const keys = h.threshold ? [LLM_CONFIG_KEY, CONFIDENCE_THRESHOLD_KEY] : [LLM_CONFIG_KEY];
      const got = await storage.get(keys as never);
      if (h.threshold) {
        const threshold = got[CONFIDENCE_THRESHOLD_KEY];
        const thresholdNumber = typeof threshold === 'number' ? threshold : Number(threshold);
        h.threshold.value = String(normalizeThreshold(Number.isFinite(thresholdNumber) ? thresholdNumber : NaN));
      }
      cfg = got[LLM_CONFIG_KEY] as Partial<LlmConfig> | undefined;
    } catch {
      setStatus(h.status, 'Could not read saved settings.', 'err');
      return;
    }
    if (cfg && typeof cfg === 'object' && typeof cfg.model === 'string' && typeof cfg.apiKey === 'string') {
      renderProviders(h, providers, cfg.providerId ?? 'custom');
      if (cfg.providerId === 'custom') {
        h.customName.value = cfg.customName ?? '';
        h.customUrl.value = cfg.baseUrl ?? '';
        h.customCompat.value = (cfg.apiCompatibility ?? 'openai') as ApiCompatibility;
        h.customFields.hidden = false;
      }
      h.apiKey.value = cfg.apiKey;
      await updateModelControl();
      if (modelMode === 'dropdown') {
        const list = [...h.modelSelect.options].map((o) => o.value);
        if (list.some((m) => m === cfg.model)) {
          h.modelSelect.value = cfg.model;
        } else {
          modelMode = 'text';
          h.modelSelect.hidden = true;
          h.modelInput.hidden = false;
          h.modelInput.value = cfg.model;
        }
      } else {
        h.modelInput.value = cfg.model;
      }
      setStatus(h.status, 'Saved configuration loaded.', 'ok');
      return;
    }
    // No saved configuration: seed from build-time defaults when provided (a
    // testing build is pre-configured and usable immediately); otherwise reveal
    // the model control (free-text for the default custom provider; a dropdown
    // once a known provider is picked) so the Model field is never invisible.
    const defaults = buildDefaults();
    if (defaults) {
      await applyDefaults(defaults);
    } else {
      await updateModelControl();
    }
  }

  /** Pre-fill the form from build-time defaults and persist them so the
   *  extension is usable immediately in a testing build. */
  async function applyDefaults(d: BuildDefaults): Promise<void> {
    renderProviders(h, providers, d.config.providerId);
    if (d.config.providerId === 'custom') {
      h.customName.value = d.config.customName ?? '';
      h.customUrl.value = d.config.baseUrl ?? '';
      h.customCompat.value = d.config.apiCompatibility;
      h.customFields.hidden = false;
    }
    h.apiKey.value = d.config.apiKey;
    if (h.threshold) h.threshold.value = String(d.confidenceThreshold);
    await updateModelControl();
    if (modelMode === 'dropdown') {
      const list = [...h.modelSelect.options].map((o) => o.value);
      if (list.includes(d.config.model)) {
        h.modelSelect.value = d.config.model;
      } else {
        modelMode = 'text';
        h.modelSelect.hidden = true;
        h.modelInput.hidden = false;
        h.modelInput.value = d.config.model;
      }
    } else {
      h.modelInput.value = d.config.model;
    }
    await storage.set({
      [LLM_CONFIG_KEY]: d.config,
      ...(h.threshold ? { [CONFIDENCE_THRESHOLD_KEY]: d.confidenceThreshold } : {}),
    });
    setStatus(h.status, 'Loaded default configuration.', 'ok');
  }

  h.form.addEventListener('submit', (e) => {
    e.preventDefault();
    void save();
  });
  if (h.clearBtn) h.clearBtn.addEventListener('click', () => void clear());
  if (h.refreshProvidersBtn) h.refreshProvidersBtn.addEventListener('click', () => void refreshProviders());
  if (h.refreshModelsBtn) h.refreshModelsBtn.addEventListener('click', () => void refreshModels());
  h.provider.addEventListener('change', () => onProviderChange());
  h.customCompat.addEventListener('change', () => void updateModelControl());

  providers = await fetchProviderIndex();
  renderProviders(h, providers);
  await loadSaved();

  return { collect, save, clear, refreshProviders, refreshModels };
}
