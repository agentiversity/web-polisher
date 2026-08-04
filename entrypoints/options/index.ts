/**
 * Options page (task 2.x, design D5).
 *
 * Reads/writes the user's Gemini API key in `browser.storage.local`. The key is
 * loaded into the form on open and cleared when the user clears it. Nothing here
 * ever logs the key or renders it to the DOM (input type=password).
 */
import { browser } from 'wxt/browser';
import {
  API_KEY_STORAGE_KEY,
  CONFIDENCE_THRESHOLD_KEY,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from '../../utils/settings';

const form = document.getElementById('settings-form') as HTMLFormElement;
const keyInput = document.getElementById('api-key') as HTMLInputElement;
const thresholdInput = document.getElementById('confidence-threshold') as HTMLInputElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

/** Clamp and round a raw threshold value to a 0–100 integer. */
function normalizeThreshold(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_CONFIDENCE_THRESHOLD;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

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

async function loadThreshold(): Promise<void> {
  try {
    const got = await browser.storage.local.get(CONFIDENCE_THRESHOLD_KEY);
    const raw = got[CONFIDENCE_THRESHOLD_KEY];
    const n = typeof raw === 'number' ? raw : Number(raw);
    thresholdInput.value = String(Number.isFinite(n) ? normalizeThreshold(n) : DEFAULT_CONFIDENCE_THRESHOLD);
  } catch {
    thresholdInput.value = String(DEFAULT_CONFIDENCE_THRESHOLD);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const raw = keyInput.value.trim();
  if (!raw) {
    setStatus('Enter a key before saving.', 'err');
    return;
  }
  // Gemini API keys start with "AI" and are typically 39+ characters.
  if (!/^AIza[A-Za-z0-9_-]{20,}$/.test(raw)) {
    setStatus("That doesn't look like a Gemini API key (expected AIza...).", 'err');
    return;
  }
  try {
    await browser.storage.local.set({
      [API_KEY_STORAGE_KEY]: raw,
      [CONFIDENCE_THRESHOLD_KEY]: normalizeThreshold(Number(thresholdInput.value)),
    });
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
void loadThreshold();
