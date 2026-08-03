## MODIFIED Requirements

### Requirement: Operate on explicit trigger
The extension SHALL perform transformations only after the user has explicitly enabled polishing for a page, and with no further per-item user interaction once enabled.

#### Scenario: No further interaction once enabled
- **WHEN** the user has triggered polishing for a page
- **THEN** text is transformed without additional clicks, buttons, popups, or manual triggers

#### Scenario: No calls before triggering
- **WHEN** the user has not triggered polishing
- **THEN** no transformation or LLM API call is performed
