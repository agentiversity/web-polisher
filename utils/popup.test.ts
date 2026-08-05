// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initPopup } from '../entrypoints/popup/index';
import { CONFIDENCE_THRESHOLD_KEY, LLM_CONFIG_KEY } from './settings';

const mocks = vi.hoisted(() => {
  const store = {} as Record<string, unknown>;
  return {
    storage: {
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
    },
    tabs: { query: vi.fn(), sendMessage: vi.fn() },
    fetchMock: vi.fn(),
    close: vi.fn(),
  };
});

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: mocks.storage }, tabs: mocks.tabs },
}));

const INDEX = {
  google: { id: 'google', name: 'Google Gemini', npm: '@ai-sdk/google', models: {} },
};

const HTML = `
<button id="polish" type="button" title="Polish Page"><img src="/icon/128.png" alt="Polish Page" /></button>
<form id="settings-form" autocomplete="off">
  <select id="provider"></select>
  <div id="custom-fields" hidden>
    <input id="custom-name" type="text" />
    <input id="custom-url" type="url" />
    <select id="custom-compat">
      <option value="openai">OpenAI-compatible</option>
      <option value="anthropic">Anthropic-compatible</option>
      <option value="gemini">Gemini-compatible</option>
    </select>
  </div>
  <select id="model-select" hidden></select>
  <input id="model-input" type="text" hidden />
  <input id="api-key" type="password" />
  <input id="confidence-threshold" type="number" />
  <button type="submit">Save</button>
  <button type="button" id="clear">Clear</button>
  <p id="status"></p>
</form>`;

beforeEach(() => {
  mocks.storage.get.mockClear();
  mocks.storage.set.mockClear();
  mocks.storage.remove.mockClear();
  mocks.tabs.query.mockClear();
  mocks.tabs.sendMessage.mockClear();
  mocks.tabs.sendMessage.mockResolvedValue({ ok: true });
  mocks.fetchMock.mockReset();
  mocks.fetchMock.mockResolvedValue({ ok: true, json: async () => INDEX });
  mocks.close.mockClear();
  vi.stubGlobal('fetch', mocks.fetchMock);
  vi.spyOn(window, 'close').mockImplementation(() => {});
  document.body.innerHTML = HTML;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function initPopupPage() {
  await initPopup(document, mocks.storage as never);
  return document.getElementById('polish') as HTMLButtonElement;
}

describe('initPopup', () => {
  it('Polish button sends apply-polish to the active tab and closes the popup', async () => {
    mocks.tabs.query.mockResolvedValue([{ id: 42 }]);
    const polish = await initPopupPage();
    polish.click();
    await vi.waitFor(() => expect(mocks.tabs.sendMessage).toHaveBeenCalled(), { timeout: 2000 });
    expect(mocks.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(mocks.tabs.sendMessage).toHaveBeenCalledWith(42, expect.objectContaining({ type: 'apply-polish' }));
    await vi.waitFor(() => expect(window.close).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('Polish click with no saved key still sends the message', async () => {
    mocks.tabs.query.mockResolvedValue([{ id: 7 }]);
    const polish = await initPopupPage();
    polish.click();
    await vi.waitFor(() => expect(mocks.tabs.sendMessage).toHaveBeenCalledWith(7, expect.anything()), { timeout: 2000 });
  });

  it('configuration can be saved from the popup form', async () => {
    const polish = await initPopupPage();
    const provider = document.getElementById('provider') as HTMLSelectElement;
    const modelInput = document.getElementById('model-input') as HTMLInputElement;
    const apiKey = document.getElementById('api-key') as HTMLInputElement;
    const threshold = document.getElementById('confidence-threshold') as HTMLInputElement;
    provider.value = 'google';
    modelInput.value = 'gemini-2.5-flash';
    apiKey.value = 'KEY';
    threshold.value = '80';
    document.getElementById('settings-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(async () => {
      const got = await mocks.storage.get(LLM_CONFIG_KEY);
      expect(got[LLM_CONFIG_KEY]).toMatchObject({ providerId: 'google', model: 'gemini-2.5-flash', apiKey: 'KEY' });
    }, { timeout: 2000 });
    const thr = await mocks.storage.get(CONFIDENCE_THRESHOLD_KEY);
    expect(thr[CONFIDENCE_THRESHOLD_KEY]).toBe(80);
    expect(polish).toBeTruthy();
  });

  it('tooltip on the Polish button reads "Polish Page"', async () => {
    const polish = await initPopupPage();
    expect(polish.title).toBe('Polish Page');
  });
});
