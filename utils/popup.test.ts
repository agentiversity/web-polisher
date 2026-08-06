// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initPopup } from '../entrypoints/popup/index';

const mocks = vi.hoisted(() => ({
  tabs: { query: vi.fn(), sendMessage: vi.fn() },
  sendMessage: vi.fn(),
  onMessage: { addListener: vi.fn() },
  openOptionsPage: vi.fn(),
  close: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: { tabs: mocks.tabs, runtime: { sendMessage: mocks.sendMessage, onMessage: mocks.onMessage, openOptionsPage: mocks.openOptionsPage } },
}));

const HTML = `
<button id="polish" type="button" title="Polish Page"><img src="/icon/128.png" alt="Polish Page" /></button>
<p id="status" role="status">Idle</p>
<button id="settings" type="button">Settings</button>`;

beforeEach(() => {
  mocks.tabs.query.mockClear();
  mocks.tabs.sendMessage.mockClear();
  mocks.tabs.sendMessage.mockResolvedValue({ ok: true });
  mocks.sendMessage.mockReset();
  mocks.onMessage.addListener.mockClear();
  mocks.openOptionsPage.mockClear();
  mocks.close.mockClear();
  vi.spyOn(window, 'close').mockImplementation(() => {});
  document.body.innerHTML = HTML;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function initPopupPage() {
  await initPopup(document);
  return {
    polish: document.getElementById('polish') as HTMLButtonElement,
    status: document.getElementById('status') as HTMLElement,
    settings: document.getElementById('settings') as HTMLButtonElement,
  };
}

describe('initPopup (slim)', () => {
  it('Polish button sends apply-polish to the active tab and closes the popup', async () => {
    mocks.tabs.query.mockResolvedValue([{ id: 42 }]);
    const { polish } = await initPopupPage();
    polish.click();
    await vi.waitFor(() => expect(mocks.tabs.sendMessage).toHaveBeenCalled(), { timeout: 2000 });
    expect(mocks.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(mocks.tabs.sendMessage).toHaveBeenCalledWith(42, expect.objectContaining({ type: 'apply-polish' }));
    await vi.waitFor(() => expect(window.close).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('Polish click with no active tab sends nothing and still closes', async () => {
    mocks.tabs.query.mockResolvedValue([]);
    const { polish } = await initPopupPage();
    polish.click();
    await vi.waitFor(() => expect(window.close).toHaveBeenCalled(), { timeout: 2000 });
    expect(mocks.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('Settings button opens the options page', async () => {
    const { settings } = await initPopupPage();
    settings.click();
    expect(mocks.openOptionsPage).toHaveBeenCalled();
  });

  it('shows the background status for the active tab on open', async () => {
    mocks.tabs.query.mockResolvedValue([{ id: 7 }]);
    mocks.sendMessage.mockResolvedValue({ type: 'polisher-status-reply', status: 'running' });
    const { status } = await initPopupPage();
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'get-polisher-status', tabId: 7 });
    expect(status.textContent).toBe('Polishing…');
    expect(status.className).toContain('status-running');
  });

  it('keeps the default Idle status when the query fails', async () => {
    mocks.tabs.query.mockResolvedValue([{ id: 7 }]);
    mocks.sendMessage.mockRejectedValue(new Error('background asleep'));
    const { status } = await initPopupPage();
    expect(status.textContent).toBe('Idle');
  });

  it('live-updates status from polisher-status broadcasts while open', async () => {
    mocks.tabs.query.mockResolvedValue([]);
    const { status } = await initPopupPage();
    const listener = mocks.onMessage.addListener.mock.calls[0]![0] as (msg: unknown) => void;
    listener({ type: 'polisher-status', status: 'done' });
    expect(status.textContent).toBe('Done');
    expect(status.className).toContain('status-done');
  });

  it('tooltip on the Polish button reads "Polish Page"', async () => {
    const { polish } = await initPopupPage();
    expect(polish.title).toBe('Polish Page');
  });
});
