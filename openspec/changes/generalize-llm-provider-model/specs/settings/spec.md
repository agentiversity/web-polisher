## ADDED Requirements

### Requirement: User can select an LLM provider
The extension SHALL let the user choose which LLM provider to use, from an alphabetical list of well-known providers with a custom-provider option always shown first.

#### Scenario: Choose a well-known provider
- **WHEN** the user opens the options page and selects a provider from the list
- **THEN** the provider's configuration is used for subsequent transformation requests

#### Scenario: Custom provider always first
- **WHEN** the options page lists providers
- **THEN** the custom-provider option is shown first, above the alphabetical list of well-known providers

#### Scenario: Offline list falls back to bundled
- **WHEN** the provider index cannot be fetched (offline or failure)
- **THEN** a bundled list of well-known providers is shown instead

### Requirement: User can configure a custom provider
The extension SHALL let the user define a custom provider by name, base URL, and API compatibility (openai, anthropic, or gemini).

#### Scenario: Custom provider saved
- **WHEN** the user enters a custom provider name, base URL, and compatibility and saves
- **THEN** the extension uses that base URL and compatibility for transformation requests

#### Scenario: URL validated per compatibility
- **WHEN** the user enters a custom provider base URL
- **THEN** the extension accepts https URLs ending in /v1 for openai/anthropic compatibility (http allowed for localhost) and generativelanguage-style roots for gemini compatibility

### Requirement: User can select or specify a model
The extension SHALL let the user pick a model from the selected provider's available models, or specify a model id directly when no list is available.

#### Scenario: Model dropdown populated
- **WHEN** a provider is selected and exposes a model-listing endpoint
- **THEN** the model dropdown lists the provider's models for the user to select from

#### Scenario: Free-text model id
- **WHEN** no model list is available for the selected provider
- **THEN** the user can type a model id composed of lowercase letters, digits, hyphens, dots, colons, and slashes

### Requirement: User can test the connection
The extension SHALL let the user verify their provider, model, and API key with a minimal test call before saving.

#### Scenario: Successful test
- **WHEN** the user clicks "Test connection" with a valid key, model, and URL
- **THEN** the extension performs a minimal API call and reports success

#### Scenario: Failed test reported
- **WHEN** the test call fails (bad key, wrong URL, or network error)
- **THEN** the extension reports the failure inline without saving anything

#### Scenario: Requires configuration
- **WHEN** the user clicks "Test connection" without a model or API key
- **THEN** the extension prompts to complete the configuration first
