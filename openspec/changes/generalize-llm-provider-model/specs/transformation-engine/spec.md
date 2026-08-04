## MODIFIED Requirements

### Requirement: Support small and cheap LLMs via API
The extension SHALL support OpenAI-compatible, Anthropic-compatible, and Gemini-compatible LLM providers accessed through their APIs, and SHALL NOT call an LLM unless an API key is configured.

#### Scenario: API-backed transformation
- **WHEN** text requires transformation
- **THEN** the extension calls the selected provider's LLM through its API and receives polished text to apply

#### Scenario: Requests routed through the background worker
- **WHEN** a content script needs the LLM to transform text
- **THEN** the request is forwarded to the background service worker, which performs the API call (to satisfy MV3 CORS restrictions)

#### Scenario: No calls without configuration
- **WHEN** no API key is configured
- **THEN** the extension makes no LLM call and leaves the text unchanged

#### Scenario: OpenAI-compatible provider
- **WHEN** the selected provider is OpenAI-compatible
- **THEN** the extension posts to the provider's chat-completions endpoint and parses the reply leniently

#### Scenario: Anthropic-compatible provider
- **WHEN** the selected provider is Anthropic-compatible
- **THEN** the extension posts to the provider's messages endpoint with Anthropic headers and parses the reply from plain text

#### Scenario: Gemini-compatible provider
- **WHEN** the selected provider is Gemini-compatible
- **THEN** the extension uses the Gemini API with JSON output mode
