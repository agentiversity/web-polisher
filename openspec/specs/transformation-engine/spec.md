## Purpose
Transform user-generated English text for naturalness and fluency (not just grammar and spelling correction) using small, cost-effective LLMs via an API, on demand after the user triggers polishing.
## Requirements
### Requirement: Transform for naturalness
The extension SHALL transform text for naturalness and fluency, going beyond grammar and spelling correction.

#### Scenario: Awkward phrasing made natural
- **WHEN** text is grammatically correct but not native-sounding (e.g. "I am agree with you")
- **THEN** the extension transforms it into natural, native-sounding English

#### Scenario: Short content left alone
- **WHEN** text is already natural or too short to transform confidently
- **THEN** the extension leaves it unchanged

#### Scenario: Failed transform leaves original intact
- **WHEN** an LLM call for a text node fails, times out, or returns no usable result
- **THEN** the original text is kept and no placeholder, empty, or partial rewrite is applied

### Requirement: Preserve original meaning
The extension SHALL preserve the original meaning and intent during transformation.

#### Scenario: Meaning unchanged
- **WHEN** user-generated text is transformed
- **THEN** the polished output conveys the same meaning, intent, and key facts as the original

### Requirement: Operate on explicit trigger
The extension SHALL perform transformations only after the user has explicitly enabled polishing for a page, and with no further per-item user interaction once enabled.

#### Scenario: No further interaction once enabled
- **WHEN** the user has triggered polishing for a page
- **THEN** text is transformed without additional clicks, buttons, popups, or manual triggers

#### Scenario: No calls before triggering
- **WHEN** the user has not triggered polishing
- **THEN** no transformation or LLM API call is performed

### Requirement: Support small and cheap LLMs via API
The extension SHALL support small, cost-effective LLMs (e.g. Gemini Flash) accessed through an API.

#### Scenario: API-backed transformation
- **WHEN** text requires transformation
- **THEN** the extension calls a small/cheap LLM through an API and receives polished text to apply

#### Scenario: Requests routed through the background worker
- **WHEN** a content script needs the LLM to transform text
- **THEN** the request is forwarded to the background service worker, which performs the API call (to satisfy MV3 CORS restrictions)

#### Scenario: No calls without configuration
- **WHEN** no API key is configured
- **THEN** the extension makes no LLM call and leaves the text unchanged

