// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initConfigForm, type ConfigFormHandles } from './configForm';
import { LLM_CONFIG_KEY, CONFIDENCE_THRESHOLD_KEY } from './settings';
import { PROVIDERS_INDEX_CACHE_KEY } from './settings';

const mocks = vi.hoisted(() => {
  const store = {} as Record<string, unknown>;
  return {
    get: vi.fn(async (k: string | string[]) => {
      const keys = Array.isArray(k) ? k : [k];
      const out: Record<string, unknown> = {};
      for (const key of keys) out[key] = store[key];
      return out;
    }),
    set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
    remove: vi.fn(async (k: string) => {
      delete store[k];
    }),
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    fetchMock: vi.fn(),
  };
});

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: mocks.get, set: mocks.set, remove: mocks.remove } } },
}));

const INDEX = {
  openai: { id: 'openai', name: 'OpenAI', npm: '@ai-sdk/openai', models: { 'gpt-4o-mini': { id: 'gpt-4o-mini' } } },
  google: { id: 'google', name: 'Google Gemini', npm: '@ai-sdk/google', models: {} },
};

const HTML = `
<form id="settings-form" autocomplete="off">
  <select id="provider"></select>
  <p class="field-error" data-error-for="provider" hidden></p>
  <div id="custom-fields" hidden>
    <input id="custom-name" type="text" />
    <p class="field-error" data-error-for="custom-name" hidden></p>
    <input id="custom-url" type="url" />
    <p class="field-error" data-error-for="custom-url" hidden></p>
    <select id="custom-compat">
      <option value="openai">OpenAI-compatible</option>
      <option value="anthropic">Anthropic-compatible</option>
      <option value="gemini">Gemini-compatible</option>
    </select>
  </div>
  <select id="model-select" hidden></select>
  <input id="model-input" type="text" hidden />
  <p class="field-error" data-error-for="model" hidden></p>
  <input id="api-key" type="password" />
  <button type="button" id="api-key-toggle">Show</button>
  <p class="field-error" data-error-for="api-key" hidden></p>
  <input id="confidence-threshold" type="range" min="0" max="90" step="1" />
  <output id="threshold-value" for="confidence-threshold"></output>
  <button type="submit">Save</button>
  <button type="button" id="clear">Clear</button>
  <button type="button" id="refresh-providers">Refresh</button>
  <button type="button" id="refresh-models">Refresh models</button>
  <p id="status"></p>
</form>`;

function setupHandles(withThreshold = true): ConfigFormHandles {
  document.body.innerHTML = HTML;
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
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
    apiKeyToggle: el<HTMLButtonElement>('api-key-toggle'),
    thresholdValue: el<HTMLElement>('threshold-value'),
    clearBtn: el<HTMLButtonElement>('clear'),
    refreshProvidersBtn: el<HTMLButtonElement>('refresh-providers'),
    refreshModelsBtn: el<HTMLButtonElement>('refresh-models'),
  };
  if (withThreshold) handles.threshold = el<HTMLInputElement>('confidence-threshold');
  return handles;
}

const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  mocks.clear();
  mocks.get.mockClear();
  mocks.set.mockClear();
  mocks.remove.mockClear();
  mocks.fetchMock.mockReset();
  mocks.fetchMock.mockResolvedValue({ ok: true, json: async () => INDEX });
  // Neutralize build-time defaults unless a test opts in via vi.stubEnv.
  vi.stubEnv('VITE_ENABLE_BUILD_DEFAULTS', '');
  vi.stubGlobal('fetch', mocks.fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('initConfigForm', () => {
  it('renders provider options with Custom first, then alphabetical', async () => {
    const h = setupHandles();
    await initConfigForm(h, mocks as never);
    const values = [...h.provider.options].map((o) => o.value);
    expect(values[0]).toBe('custom');
    // Alphabetical display names after custom.
    const names = [...h.provider.options].map((o) => o.textContent);
    expect(names.slice(1)).toEqual([...names.slice(1)].sort());
  });

  it('loads a saved configuration into the controls', async () => {
    const h = setupHandles();
    await mocks.set({
      [LLM_CONFIG_KEY]: { providerId: 'google', baseUrl: 'x', apiCompatibility: 'gemini', model: 'gemini-2.5-flash', apiKey: 'KEY' },
      [CONFIDENCE_THRESHOLD_KEY]: 70,
    });
    await initConfigForm(h, mocks as never);
    expect(h.provider.value).toBe('google');
    expect(h.apiKey.value).toBe('KEY');
    expect(h.threshold?.value).toBe('70');
    expect(h.modelInput.value).toBe('gemini-2.5-flash');
  });

  it('shows a model dropdown for providers with models and free-text otherwise', async () => {
    const h = setupHandles();
    await initConfigForm(h, mocks as never);
    h.provider.value = 'openai';
    h.provider.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(h.modelSelect.hidden).toBe(false), { timeout: 2000 });
    expect([...h.modelSelect.options].map((o) => o.value)).toEqual(['gpt-4o-mini']);

    h.provider.value = 'google';
    h.provider.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(h.modelInput.hidden).toBe(false), { timeout: 2000 });
  });

  it('collect rejects when the API key is missing', async () => {
    const h = setupHandles();
    const form = await initConfigForm(h, mocks as never);
    const cfg = form.collect();
    expect(cfg).toHaveProperty('errors');
  });

  it('renders inline field errors on an invalid save', async () => {
    const h = setupHandles();
    const form = await initConfigForm(h, mocks as never);
    expect(await form.save()).toBe(false);
    const slot = h.form.querySelector('[data-error-for="api-key"]') as HTMLElement;
    expect(slot.hidden).toBe(false);
    expect(slot.textContent).toContain('Enter an API key');
    expect(h.apiKey.getAttribute('aria-invalid')).toBe('true');
    expect(h.status.textContent).toBe('Fix the highlighted fields.');
  });

  it('clears field errors after a successful save', async () => {
    const h = setupHandles();
    const form = await initConfigForm(h, mocks as never);
    h.provider.value = 'google';
    h.modelInput.value = 'gemini-2.5-flash';
    h.apiKey.value = 'KEY';
    expect(await form.save()).toBe(true);
    const slot = h.form.querySelector('[data-error-for="api-key"]') as HTMLElement;
    expect(slot.hidden).toBe(true);
    expect(h.apiKey.getAttribute('aria-invalid')).toBeNull();
  });

  it('syncs the live threshold readout to the slider', async () => {
    const h = setupHandles();
    await initConfigForm(h, mocks as never);
    h.threshold!.value = '35';
    h.threshold!.dispatchEvent(new Event('input'));
    expect(h.thresholdValue!.textContent).toBe('35');
  });

  it('toggles the API-key visibility on the eye button', async () => {
    const h = setupHandles();
    await initConfigForm(h, mocks as never);
    expect(h.apiKey.type).toBe('password');
    h.apiKeyToggle!.click();
    expect(h.apiKey.type).toBe('text');
    expect(h.apiKeyToggle!.textContent).toBe('Hide');
    h.apiKeyToggle!.click();
    expect(h.apiKey.type).toBe('password');
    expect(h.apiKeyToggle!.textContent).toBe('Show');
  });

  it('save persists llm:config and the threshold', async () => {
    const h = setupHandles();
    const form = await initConfigForm(h, mocks as never);
    h.provider.value = 'google';
    h.modelInput.value = 'gemini-2.5-flash';
    h.apiKey.value = 'KEY';
    h.threshold!.value = '80';
    expect(await form.save()).toBe(true);
    const got = await mocks.get(LLM_CONFIG_KEY);
    expect(got[LLM_CONFIG_KEY]).toMatchObject({ providerId: 'google', model: 'gemini-2.5-flash', apiKey: 'KEY' });
    const thr = await mocks.get(CONFIDENCE_THRESHOLD_KEY);
    expect(thr[CONFIDENCE_THRESHOLD_KEY]).toBe(80);
    expect(h.status.textContent).toBe('Saved.');
  });

  it('clear removes the config and resets the form', async () => {
    const h = setupHandles();
    const form = await initConfigForm(h, mocks as never);
    h.provider.value = 'google';
    h.modelInput.value = 'gemini-2.5-flash';
    h.apiKey.value = 'KEY';
    await form.save();
    await form.clear();
    const got = await mocks.get(LLM_CONFIG_KEY);
    expect(got[LLM_CONFIG_KEY]).toBeUndefined();
    expect(h.apiKey.value).toBe('');
    expect(h.provider.value).toBe('custom');
  });

  it('reveals the model control when no configuration is saved', async () => {
    const h = setupHandles();
    await initConfigForm(h, mocks as never);
    // No saved config → free-text model input for the default custom provider.
    expect(h.modelInput.hidden).toBe(false);
    expect(h.modelSelect.hidden).toBe(true);
  });

  it('seeds the form and persists build-time defaults when enabled and no config is saved', async () => {
    vi.stubEnv('VITE_ENABLE_BUILD_DEFAULTS', '1');
    vi.stubEnv('VITE_DEFAULT_PROVIDER_ID', 'google');
    vi.stubEnv('VITE_DEFAULT_BASE_URL', 'https://generativelanguage.googleapis.com');
    vi.stubEnv('VITE_DEFAULT_COMPAT', 'gemini');
    vi.stubEnv('VITE_DEFAULT_MODEL', 'gemini-2.5-flash');
    vi.stubEnv('VITE_DEFAULT_API_KEY', 'DEFAULT_KEY');
    vi.stubEnv('VITE_DEFAULT_CONFIDENCE_THRESHOLD', '75');

    const h = setupHandles();
    await initConfigForm(h, mocks as never);
    expect(h.provider.value).toBe('google');
    expect(h.apiKey.value).toBe('DEFAULT_KEY');
    expect(h.modelInput.value).toBe('gemini-2.5-flash');
    expect(h.threshold?.value).toBe('75');
    const got = await mocks.get(LLM_CONFIG_KEY);
    expect(got[LLM_CONFIG_KEY]).toMatchObject({ providerId: 'google', model: 'gemini-2.5-flash', apiKey: 'DEFAULT_KEY' });
    expect(h.status.textContent).toBe('Loaded default configuration.');
  });

  it('works without a threshold control (popup surface)', async () => {
    const h = setupHandles(false);
    const form = await initConfigForm(h, mocks as never);
    h.provider.value = 'google';
    h.modelInput.value = 'gemini-2.5-flash';
    h.apiKey.value = 'KEY';
    expect(await form.save()).toBe(true);
    expect(mocks.set).not.toHaveBeenCalledWith(expect.objectContaining({ [CONFIDENCE_THRESHOLD_KEY]: expect.anything() }));
  });
});
