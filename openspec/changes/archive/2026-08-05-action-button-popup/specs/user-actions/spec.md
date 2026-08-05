## MODIFIED Requirements

### Requirement: Action button applies polishing to the active page
The extension SHALL provide a toolbar action button that opens the polish popup; applying polishing to the active page is triggered from that popup.

#### Scenario: Click applies to the current tab
- **WHEN** the user clicks the popup's "Polish Page" button while a page is active
- **THEN** the polisher is applied to that page's user-generated content

#### Scenario: Click opens the popup
- **WHEN** the user clicks the extension's action button while a page is active
- **THEN** the polish popup opens and no page text is changed by the click itself
