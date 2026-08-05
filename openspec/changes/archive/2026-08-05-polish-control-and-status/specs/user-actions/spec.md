## MODIFIED Requirements

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
