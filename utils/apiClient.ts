/**
 * OpenAI-compatible and Anthropic-compatible HTTP clients (design D5/D6).
 *
 * Raw fetch (native) for the two wire formats; Gemini continues through the
 * @google/generative-ai SDK in `llmClient.ts`. Each function posts one batch
 * prompt and returns the raw assistant text; parsing the JSON array back into
 * items happens in `llmClient.parseResults`.
 */
import type { ApiCompatibility } from './settings';

/** HTTP error with a status code, so `classifyError` can map it to the taxonomy. */
export class ApiHttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`provider http ${status}`);
    this.status = status;
  }
}

/** Normalized base URL (no trailing slash) + resolved endpoint for a compat. */
export function endpointFor(baseUrl: string, compat: ApiCompatibility, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

/** Chat-completions call for OpenAI-compatible APIs. Returns the assistant text. */
export async function openAiChat(
  baseUrl: string,
  model: string,
  prompt: string,
  apiKey: string,
  signal?: AbortSignal,
  system?: string,
): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const res = await fetch(endpointFor(baseUrl, 'openai', '/chat/completions'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 4096,
    }),
    signal,
  });
  if (!res.ok) throw new ApiHttpError(res.status);
  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('empty chat completion');
  return content;
}

/** Messages call for Anthropic-compatible APIs. Returns the concatenated text. */
export async function anthropicChat(
  baseUrl: string,
  model: string,
  prompt: string,
  apiKey: string,
  signal?: AbortSignal,
  system?: string,
): Promise<string> {
  const res = await fetch(endpointFor(baseUrl, 'anthropic', '/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.4,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal,
  });
  if (!res.ok) throw new ApiHttpError(res.status);
  const data = (await res.json()) as { content?: { type?: string; text?: string }[] };
  const text = Array.isArray(data?.content)
    ? data.content.map((block) => (block?.type === 'text' ? block.text ?? '' : '')).join('')
    : '';
  if (!text.trim()) throw new Error('empty messages response');
  return text;
}
