## MODIFIED Requirements

### Requirement: User can configure the API key
The extension SHALL let the user set and remove their LLM API key from the options page or the action popup, persisted in local storage.

#### Scenario: Set the API key
- **WHEN** the user enters a valid API key in the options page or the action popup and saves
- **THEN** the key is stored in `browser.storage.local` and used for subsequent transformation requests

#### Scenario: Key persists across restarts
- **WHEN** the user has saved an API key
- **THEN** the key remains available on later browser sessions without re-entry

#### Scenario: Remove the API key
- **WHEN** the user clears the key in the options page or the action popup
- **THEN** the stored key is removed and no further LLM calls are made until a new key is set
