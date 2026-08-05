## ADDED Requirements

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
