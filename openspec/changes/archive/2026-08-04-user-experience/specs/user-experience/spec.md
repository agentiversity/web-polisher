## MODIFIED Requirements

### Requirement: Operate with minimal disruption
The extension SHALL provide clear initial feedback that polishing is in progress, then leave the user undisturbed while individual text updates are applied.

#### Scenario: Brief indicator on trigger
- **WHEN** the user has triggered polishing
- **THEN** a brief loading indicator appears, and polished text is highlighted with the original available on hover so the user can see what changed

#### Scenario: No repeated interruptions after trigger
- **WHEN** the extension is applying polishing results
- **THEN** no further popups, dialogs, or per-item confirmations are shown

### Requirement: Require explicit trigger before transformation
The extension SHALL NOT transform page content until the user explicitly triggers it via the action button.

#### Scenario: No trigger, no transformation
- **WHEN** a page loads without the user activating the action button
- **THEN** the extension does not transform any text on that page

#### Scenario: Silent on failure
- **WHEN** a triggered transformation fails or is rejected (e.g. offline, low confidence, API error)
- **THEN** the extension does not surface an error to the user and simply leaves the original text unchanged
