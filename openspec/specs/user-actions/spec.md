## Purpose

Gives the user explicit control over when text polishing runs: a toolbar action button applies polishing to the active page on demand, with nothing transformed by default.
## Requirements
### Requirement: Action button applies polishing to the active page
The extension SHALL provide a toolbar action button that opens the polish popup; the popup's "Polish Page" button toggles polishing of the active page: starting it when nothing is running, pausing it while in progress, and resuming it from where it paused until finished.

#### Scenario: Click applies to the current tab
- **WHEN** the user clicks the popup's "Polish Page" button while a page is active and nothing is running
- **THEN** polishing starts on that page's user-generated content and the popup closes immediately

#### Scenario: Click opens the popup
- **WHEN** the user clicks the extension's action button while a page is active
- **THEN** the polish popup opens and no page text is changed by the click itself

#### Scenario: Pause and resume
- **WHEN** the user clicks the popup's "Polish Page" button while polishing is in progress, and then clicks it again
- **THEN** the first click pauses polishing and the second resumes it from where it paused, continuing until finished

### Requirement: Nothing transformed by default
The extension SHALL NOT transform any page content, and SHALL NOT make any LLM calls, until the user clicks the action button.

#### Scenario: Default is a no-op
- **WHEN** a page loads and the user has not clicked the action button
- **THEN** no page text is transformed and no LLM calls are made

#### Scenario: No accidental spend
- **WHEN** a page contains content that is already polished or natural
- **THEN** it is left unchanged unless the user explicitly triggers polishing

### Requirement: Silent after trigger
The extension SHALL perform the transformation without further per-item interaction or on-screen controls once the user has triggered it for a page.

#### Scenario: One click, silent rest
- **WHEN** the user has clicked the action button for a page
- **THEN** the transformation proceeds automatically on that page without further clicks, popups, or prompts

