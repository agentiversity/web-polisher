## Purpose
Provide clear visual feedback once, after the user triggers polishing, so it is obvious the extension is working — then remain quiet while text updates. The initial indicator (brief spinner/highlight) is intentional and fades quickly; the blue highlights with tooltip originals let the user see and compare what changed.
## Requirements
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

### Requirement: Toolbar icon shows polish status
The extension SHALL show the polishing lifecycle status on the toolbar action icon: not started, in progress, paused, and complete.

#### Scenario: Not started
- **WHEN** the user has not triggered polishing on a page (or the page has just loaded)
- **THEN** the toolbar icon shows the "not started" state

#### Scenario: In progress
- **WHEN** the user triggers polishing and it is running
- **THEN** the toolbar icon shows the "in progress" state

#### Scenario: Paused
- **WHEN** the user pauses a running polish
- **THEN** the toolbar icon shows the "paused" state

#### Scenario: Complete
- **WHEN** all currently-known user content has been processed and polishing is not paused
- **THEN** the toolbar icon shows the "complete" state

### Requirement: Show rewrite confidence
The extension SHALL surface the quality-gate confidence score (0–100) of each applied rewrite in the page UI.

#### Scenario: Score badge on rewritten text
- **WHEN** a rewrite is applied to the page
- **THEN** its confidence score is shown as a small badge next to the rewritten text

#### Scenario: Score shown with the original on hover
- **WHEN** the user hovers a rewritten span
- **THEN** the tooltip shows the confidence score together with the original text

#### Scenario: Cached rewrites keep their score
- **WHEN** a rewrite is served from the result cache
- **THEN** the cached confidence score is displayed the same way as a fresh rewrite

