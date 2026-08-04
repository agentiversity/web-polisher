## Why

Today the extension proves its DOM mechanics by prefixing comments with a literal `[text-polisher] ` string. To become a real product it must actually rewrite user-generated English into natural, native-sounding language. This phase wires a small, cheap LLM (Gemini Flash) into the existing click-to-apply pipeline, so the "transform" step does real work instead of placeholder marking.

## What Changes

- Replace the deterministic `[text-polisher] …` placeholder transform with a real LLM-backed transform that rewrites text for naturalness/fluency while preserving meaning.
- Add an **options page + API-key management**: the user supplies a Gemini API key (stored in `browser.storage.local`); a per-page `apply-polish` run will not call the LLM if no key is configured.
- Route all LLM requests through the **background service worker** (MV3 CORS restriction) — extend the existing content ↔ background message plumbing with a `transform-text` message.
- Add a small **sentinel/state model**: transformed text is recorded for idempotency; text too short or already natural is left unchanged; failures (no API key, network, rate limit) degrade gracefully without corrupting the page.
- **(BREAKING)** The placeholder prefix is removed — the extension no longer inserts `[text-polisher] `. Existing processed-marking (`data-text-polished`) stays for idempotency.

## Capabilities

### New Capabilities
- `settings`: User-provided LLM configuration (Gemini API key) via an options page, persisted in `browser.storage.local`, and the runtime rules for when transformation may/ may not run based on that configuration.

### Modified Capabilities
- `transformation-engine`: The transform step changes from a placeholder to an actual LLM rewrite for naturalness (meaning-preserving), triggered by the existing explicit action, with requests routed through the background worker and cost/error safeguards.

## Impact

- **New files**: `entrypoints/options/` (options page), `utils/llmClient.ts` (Gemini client, background-side), `utils/polish.ts` (orchestration: detect roots → collect text → LLM transform → apply), plus tests.
- **Modified files**: `entrypoints/background.ts` (handle `transform-text`, hold the LLM client), `entrypoints/content.ts` (call polish instead of the placeholder), `wxt.config.ts` (register options page), `package.json` (add `@google/generative-ai`).
- **Dependencies**: adds `@google/generative-ai`; no other runtime deps.
- **No change** to the existing content-detection, action-button trigger, or shadow-DOM walker — this phase consumes them.
