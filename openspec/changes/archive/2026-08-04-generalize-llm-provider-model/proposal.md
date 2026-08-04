## Why

The extension is hardwired to Google Gemini: a hardcoded `API_MODEL` constant, the `gemini:apiKey` storage key, and the `@google/generative-ai` SDK. Anyone with an OpenAI, Anthropic, or OpenAI/Anthropic-compatible key (OpenRouter, Groq, DeepSeek, Mistral, Ollama, LM Studio, ...) cannot use the add-on at all. This change generalizes the LLM layer so the user can pick any provider and any model.

## What Changes

- **Provider registry.** The well-known providers list is populated at options-page open from a fetched index (default: `models.dev`), cached in `browser.storage.local` after the first successful fetch, with a bundled curated fallback list (OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, Together, Fireworks, Cerebras, xAI, Ollama, LM Studio, Azure OpenAI, Perplexity, OpenCode Go, OpenCode Zen, DeepInfra) when the fetch fails or is offline. **"Custom Provider" is pinned first**, always.
- **Options page.** Alphabetical provider dropdown → model dropdown → API key field. The model dropdown is populated from the provider's model-listing endpoint (cached), falling back to a small bundled suggestion list per well-known provider, and finally to a **free-text model-id field** (permissive validation `[a-z0-9-.:/]`) plus an **openai/anthropic compatibility toggle** when no list is available or inferable.
- **Custom Provider.** User supplies a display name, a base URL (`/v1` suffix for openai/anthropic compatibility; generativelanguage root for gemini compatibility), and picks **openai / anthropic / gemini** compatibility.
- **LLM client.** Gemini keeps the existing `@google/generative-ai` SDK. OpenAI-compatible and Anthropic-compatible providers use raw `fetch` with per-API request builders and response parsers; the batch prompt is adapted per API (JSON output mode where the API supports it; robust text parsing where not).
- **Storage.** A single active config object: `{ providerId, customName?, baseUrl?, apiCompatibility?, model, apiKey }` in `browser.storage.local`.
- **(BREAKING) No migration.** The legacy `gemini:apiKey` value is no longer read. Existing users must re-enter their key under the new provider config. The E2E key-seeding bridge and tests move to the new schema.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `settings`: the user-facing configuration becomes provider + model + API key (well-known or custom provider, model dropdown or free-text, single API key), replacing the Gemini-only key field.
- `transformation-engine`: the transform client supports OpenAI-compatible, Anthropic-compatible, and Gemini-compatible providers through their APIs (Gemini via the existing SDK; others via fetch), keeping background-worker routing, batching, timeout, and the no-config-no-call guarantee.

## Impact

- **Modified files**: `utils/settings.ts` (registry/config constants), `utils/llmClient.ts` (provider dispatch + fetch paths), `utils/llmClient.test.ts`, `entrypoints/options/` (provider/model/key UI), `entrypoints/background.ts` (fetch proxy for providers/models index + config schema), `utils/live.integration.test.ts`, `e2e/*` (key seeding to the new schema).
- **New files**: `utils/providers.ts` (registry, index fetch + cache, bundled fallback, models-endpoint fetch + cache), `utils/apiClient.ts` (OpenAI/Anthropic request builders, response parsers), tests for both.
- **Dependencies**: keeps `@google/generative-ai`; no new runtime dependency (native `fetch`).
- **No change** to content detection, the lazy pipeline, text replacement, the quality gate, or the result cache — they consume the LLM client unchanged.
