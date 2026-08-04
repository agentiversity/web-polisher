## Context

Today the transform path is Gemini-only: `utils/settings.ts` hardcodes `API_MODEL`, `utils/llmClient.ts` constructs a `@google/generative-ai` client from the `gemini:apiKey` storage key, and `entrypoints/options/` edits that one key. The batch flow (collect → `transform-text` → apply), quality gate, result cache, and lazy pipeline in `utils/polish.ts`/`utils/pipeline.ts` are all provider-agnostic and must stay untouched.

Constraints carried over: MV3 (only the background worker may fetch cross-origin — options page and content scripts route through it), Firefox target, no new runtime deps beyond the existing Gemini SDK, on-demand trigger, and the no-config-no-call guarantee.

## Goals / Non-Goals

**Goals:**
- Let the user choose any provider (well-known or custom) and any model, and store the choice as a single active config.
- Serve OpenAI-compatible, Anthropic-compatible, and Gemini-compatible APIs from the background worker with uniform batching, timeout, and error taxonomy.
- Provide model discovery when the provider exposes a models endpoint, a sensible bundled fallback, and a free-text escape hatch.
- Keep all existing pipeline/quality/caching behavior byte-for-byte provider-agnostic.

**Non-Goals:**
- Migrating the legacy `gemini:apiKey` (deliberately breaking — user re-enters).
- Multiple simultaneous provider configs or per-provider keys.
- Embeddings/other endpoints — chat-style text completion only.
- Auth beyond a single API key (no OAuth, no AWS signatures, no per-header config).

## Decisions

**D1 — Provider index: runtime-fetch, cached, bundled fallback.**
`utils/providers.ts` fetches `MODELS_INDEX_URL` (constant, default `https://models.dev/api.json`) through the background worker, maps its schema to a normalized `ProviderDef[]` via a small adapter, and caches the result in `storage.local` (`PROVIDERS_INDEX_CACHE_KEY`, ~24h TTL). On fetch failure or empty result, the bundled curated `ProviderDef[]` is used. The options page never fetches directly — it asks the background via a message, then caches locally for the session. Custom Provider is always prepended.

**D2 — Model list: cached live-fetch → bundled suggestions → free-text.**
For a selected provider with an API key: call its models endpoint (OpenAI/Anthropic-compatible: `GET {baseUrl}/models`; Gemini: `listModels` via SDK), map ids → dropdown, cache with TTL. If the endpoint is absent or fails: use a small bundled suggestion list per well-known provider (curated ~5 ids). If neither applies (custom provider, no endpoint, no suggestions): show a free-text model-id input validated against `^[a-z0-9][a-z0-9-.:/]*$` plus an **openai/anthropic compatibility toggle** (Gemini-compatible custom providers default the toggle off; model is free-text). Selection from a populated dropdown bypasses validation.

**D3 — Custom provider.**
Fields: display name (free text), base URL, and a three-way compatibility selector. URL rules: openai/anthropic compat requires an `https://` URL ending in `/v1` (allow `http://` for `localhost`/127.0.0.1 to support Ollama/LM Studio); gemini compat expects a `generativelanguage.googleapis.com`-style root (no `/v1` requirement). The normalized config stores `providerId: 'custom'`, `customName`, `baseUrl`, `apiCompatibility`.

**D4 — Storage: single active config, no migration.**
One object under `LLM_CONFIG_KEY` (`llm:config`): `{ providerId, customName?, baseUrl?, apiCompatibility?, model, apiKey }`. `gemini:apiKey` is intentionally ignored (per decision; update the `set-test-key` background handler and E2E seeding to write the new key). Switching provider clears the model/key fields for re-entry.

**D5 — Client dispatch.**
`utils/llmClient.ts` reads the config and dispatches:
- `gemini` (well-known or gemini-compatible custom) → existing `@google/generative-ai` path (unchanged JSON-output batching).
- `openai` compat → `utils/apiClient.ts` `POST {baseUrl}/chat/completions`, `response_format: {type:'json_object'}` (our prompt already contains "json"), parsed leniently.
- `anthropic` compat → `POST {baseUrl}/messages` with `x-api-key` + `anthropic-version: 2023-06-01` headers and `max_tokens`; no JSON mode — the reply is plain text and parsed by extracting the JSON array (strip markdown fences / leading prose).

All paths share `LLM_TIMEOUT_MS` (AbortController for fetch; existing SDK signal for Gemini), the same `chunk(BATCH_SIZE)` batching, the same `classifyError` taxonomy, and the same per-item `TransformResult` shape — so `polish.ts`, the quality gate, and the cache never know which provider served the request.

**D6 — Prompt adaptation.**
The `buildBatchPrompt` JSON-array instruction is used verbatim for OpenAI (json_object) and Gemini (responseMimeType json). For Anthropic, the same instruction is sent as plain text and the response is parsed with `parseResults` extended to strip fences and locate the outermost `[...]`.

**D7 — Background proxy for index/model fetches.**
New `provider-index` (and optionally `provider-models`) message types on the background worker; options page calls them, background does the fetch (host permissions already `*://*/*`), returns normalized data. Cache lives in `storage.local` so re-opening the options page is instant.

**D8 — Model-id and URL validation are the only new trust-boundary inputs.**
The index/adapters are display-only: they prefill fields, never execute. The actual request targets are the user's base URL + key. Free-text model ids are constrained to `[a-z0-9-.:/]` to block injection into request paths.

**D9 — "Test connection" button.**
A button in the options page sends one minimal chat completion (`{model}`, prompt `"Reply with exactly: ok"`, `max_tokens` ~5) using the *current form values* — it validates key, URL, and model before anything is saved. It routes through the background worker (fetch for openai/anthropic, existing SDK for gemini) with `LLM_TIMEOUT_MS`, and reports success or a normalized failure reason (bad key / network / wrong URL) inline. It never persists the config and never touches the result cache.

## Risks / Trade-offs

- **Remote index (models.dev) is an availability + trust point** → bundled fallback covers offline; index is prefill-only (never controls where requests go, the user's base URL + key do). Fetch failure is silently non-fatal.
- **Anthropic has no JSON output mode** → lenient text extraction in `parseResults`; the quality gate still rejects garbage, so a mis-parse degrades to `ok:false` (original text kept), never corruption.
- **Breaking key change** → existing users (and the current live tests / E2E seeding) must re-enter or reseed; called out in the proposal and README.
- **Model-list freshness** → cached 24h; user can force re-fetch from the options page if needed.
- **`response_format` json_object can be flaky on some OpenAI-compatible hosts** → same lenient parse + quality gate as Anthropic protects.

## Migration Plan

No data migration (deliberate). Deploy: update config key; options page reads `llm:config`, ignoring `gemini:apiKey`. E2E `set-test-key` and live integration tests seed `llm:config`. README documents the one-time re-entry.

## Open Questions

- Exact `models.dev/api.json` schema mapping (adapter written against a sampled response; wrapped so a schema change degrades to the bundled list, never a crash).
