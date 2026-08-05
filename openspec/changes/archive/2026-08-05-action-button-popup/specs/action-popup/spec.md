## Purpose

Provides the toolbar popup panel where the user applies polishing from a prominent icon-only button and can adjust the provider, model, and API key configuration inline before doing so.

## ADDED Requirements

### Requirement: Action button opens the polish popup
The extension SHALL open a popup panel when the user clicks the toolbar action button, instead of applying polish directly.

#### Scenario: Click opens the popup
- **WHEN** the user clicks the extension's action button while a page is active
- **THEN** a popup panel opens and no page text is changed by the click itself

#### Scenario: Popup closes after trigger
- **WHEN** the user triggers polishing from the popup
- **THEN** the popup closes

### Requirement: Prominent polish trigger
The popup SHALL provide a large, centrally placed button showing the extension icon with no visible text, whose native tooltip reads "Polish Page", that applies polishing to the active page when clicked.

#### Scenario: Icon-only button with tooltip
- **WHEN** the popup is open and the user hovers the topmost button
- **THEN** a tooltip reading "Polish Page" is shown and the button displays the extension icon without visible text

#### Scenario: Button applies polish to the active tab
- **WHEN** the user clicks the "Polish Page" button while a page is active
- **THEN** polishing is applied to that page's user-generated content

### Requirement: Inline provider, model, and key configuration
The popup SHALL let the user view and change the LLM provider, model, and API key before polishing; changes are persisted to local storage and used for subsequent transformation requests.

#### Scenario: Controls reflect saved configuration
- **WHEN** the popup opens and a configuration has been saved
- **THEN** the provider, model, and key controls reflect the saved values

#### Scenario: Config saved from the popup
- **WHEN** the user changes the provider, model, or API key in the popup and saves
- **THEN** the configuration is persisted and used for subsequent transformation requests

#### Scenario: No key means no transformation
- **WHEN** the user triggers polishing from the popup but no API key is configured
- **THEN** no LLM call is made and no page text is changed
