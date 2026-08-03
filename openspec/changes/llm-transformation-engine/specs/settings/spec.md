## Purpose

Lets the user configure the LLM provider (Gemini API key) through an options page and stores it locally, and governs when the extension is permitted to make LLM calls.

## ADDED Requirements

### Requirement: User can configure the API key
The extension SHALL let the user set and remove their LLM API key from an options page, persisted in local storage.

#### Scenario: Set the API key
- **WHEN** the user enters a valid API key in the options page and saves
- **THEN** the key is stored in `browser.storage.local` and used for subsequent transformation requests

#### Scenario: Key persists across restarts
- **WHEN** the user has saved an API key
- **THEN** the key remains available on later browser sessions without re-entry

#### Scenario: Remove the API key
- **WHEN** the user clears the key in the options page
- **THEN** the stored key is removed and no further LLM calls are made until a new key is set

### Requirement: LLM calls require configuration
The extension SHALL NOT call an LLM unless the user has supplied an API key.

#### Scenario: No key means no transformation
- **WHEN** the user triggers polishing but no API key is configured
- **THEN** no LLM call is made and no page text is changed

#### Scenario: Key present allows calls
- **WHEN** an API key is configured and the user triggers polishing
- **THEN** the extension performs LLM-backed transformation of eligible text
