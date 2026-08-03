/**
 * Options page (task 2.x, design D5).
 *
 * Reads/writes the user's Gemini API key in `browser.storage.local`. The key is
 * loaded into the form on open and cleared when the user clears it. Nothing here
 * ever logs the key or renders it to the DOM (input type=password).
 */
import { browser } from 'wxt/browser';
import { API_KEY_STORAGE_KEY } from '../../utils/settings';

const form = document.getElementById('settings-form') as HTMLFormElement;
const keyInput = document.getElementById('api-key') as HTMLInputElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

function setStatus(message: string, kind: 'ok' | 'err' | '' = ''): void {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`;
}

async function loadKey(): Promise<void> {
  try {
    const got = await browser.storage.local.get({ [API_KEY_STORAGE_KEY]: '' });
    keyInput.value = typeof got[API_KEY_STORAGE_KEY] === 'string' ? got[API_KEY_STORAGE_KEY] : '';
  } catch (err) {
    setStatus('Could not read stored key.', 'err');
  }
  if (keyInput.value) setStatus('A key is configured.', 'ok');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const raw = keyInput.value.trim();
  if (!raw) {
    setStatus('Enter a key before saving.', 'err');
    return;
  }
  try {
    await browser.storage.local.set({ [API_KEY_STORAGE_KEY]: raw });
    setStatus('Key saved.', 'ok');
  } catch {
    setStatus('Could not save the key.', 'err');
  }
});

clearBtn.addEventListener('click', async () => {
  try {
    await browser.storage.local.remove(API_KEY_STORAGE_KEY);
    keyInput.value = '';
    setStatus('Key cleared. Transformation is now disabled.', 'ok');
  } catch {
    setStatus('Could not clear the key.', 'err');
  }
});

void loadKey();
