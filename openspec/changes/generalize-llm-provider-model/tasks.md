## 1. Provider registry & index

- [ ] 1.1 Add `utils/providers.ts`: `ProviderDef` type (id, name, baseUrl, apiCompatibility, bundledModels?) and a bundled curated `ProviderDef[]` (alphabetical; OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, Together, Fireworks, Cerebras, xAI, Ollama, LM Studio, Azure OpenAI, Perplexity, OpenCode Go, OpenCode Zen, DeepInfra)
- [ ] 1.2 Implement `fetchProviderIndex()`: background-fetched index from `MODELS_INDEX_URL` (default models.dev), mapped via an adapter to `ProviderDef[]`, cached in `storage.local` with TTL; on failure returns the bundled list
- [ ] 1.3 Add `PROVIDERS_INDEX_CACHE_KEY` / TTL / `MODELS_INDEX_URL` / `LLM_CONFIG_KEY` constants to `utils/settings.ts`
- [ ] 1.4 Unit tests: `utils/providers.test.ts` — adapter mapping, cache read/write, TTL, corrupt-cache resilience, bundled fallback

## 2. Options page: provider + model + key

- [ ] 2.1 Provider dropdown: "Custom Provider" pinned first, then alphabetical well-known providers; populated from the (cached) index; force-refresh control
- [ ] 2.2 Model control: on provider select, request the model list (cached live-fetch via background; bundled suggestions for well-known providers when fetch fails); render a dropdown, or fall back to a free-text model-id input with an openai/anthropic compatibility toggle
- [ ] 2.3 Custom-provider fields: name + base URL + openai/anthropic/gemini compatibility selector, with per-compat URL validation (https /v1 for openai-anthropic; http allowed for localhost; gemini root otherwise)
- [ ] 2.4 API key field; save/clear writes the single config object under `llm:config`; load populates the form from it
- [ ] 2.5 Free-text model-id validated against `^[a-z0-9][a-z0-9-.:/]*$`; selection-from-dropdown skips validation
- [ ] 2.6 Add a "Test connection" button: minimal one-prompt chat completion via the background (openai/anthropic through `apiClient.ts`, gemini through the SDK) using the current form values; inline success/failure; never saves; blocks when key/model missing
- [ ] 2.7 Options page tests (jsdom): provider list ordering + custom-first, model dropdown vs free-text fallback, URL validation, save/load round-trip, permissive model-id validation, test-connection request shape + failure reporting

## 3. Client dispatch (OpenAI / Anthropic via fetch)

- [ ] 3.1 Add `utils/apiClient.ts`: OpenAI-compatible `chat/completions` request builder + lenient response parser; Anthropic-compatible `messages` request builder (`x-api-key`, `anthropic-version`, `max_tokens`) + plain-text JSON-array extraction (strip fences / leading prose)
- [ ] 3.2 Extend `parseResults` in `utils/llmClient.ts` for Anthropic-style text replies (locate outermost `[...]`)
- [ ] 3.3 Dispatch in `transform()` from the stored config: gemini-compatible → existing SDK path; openai/anthropic → `utils/apiClient.ts`; keep `BATCH_SIZE`, `LLM_TIMEOUT_MS` (AbortController), `classifyError`, per-item `TransformResult`, and cache integration unchanged
- [ ] 3.4 Unit tests: `utils/apiClient.test.ts` — request shapes per API, header correctness, parser leniency, timeout/abort, error taxonomy; extend `llmClient.test.ts` for the new config-key reads and dispatch

## 4. Background & config plumbing

- [ ] 4.1 Read config from `llm:config` (ignore legacy `gemini:apiKey`); keep `getConfidenceThreshold` unchanged
- [ ] 4.2 Add background message handlers for provider-index / provider-models fetches (options page → background, MV3 CORS)
- [ ] 4.3 Update `set-test-key` E2E seed bridge to write `llm:config`
- [ ] 4.4 Update `utils/live.integration.test.ts` and `e2e/*` seeding to the new config schema

## 5. Verification & docs

- [ ] 5.1 `npm run compile`, full `npm test`
- [ ] 5.2 Real-Gemini live integration test still green under the new config shape
- [ ] 5.3 Update README (settings/options section, provider support, one-time key re-entry breaking note)
- [ ] 5.4 Validate and archive the change
