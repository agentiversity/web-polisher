## MODIFIED Requirements

### Requirement: Exclude UI elements
The extension SHALL exclude UI elements, navigation, ads, and labels from transformation.

#### Scenario: Button and navigation text untouched
- **WHEN** an element is a button, link, navigation, banner, or carries an interactive role (e.g. `role="button"`, `role="navigation"`)
- **THEN** its text is never transformed

#### Scenario: Non-native interactive wrapper untouched
- **WHEN** interactive text is rendered inside a non-`<button>` wrapper (e.g. a `div` or `span` acting as a button on Reddit or Facebook, or a link-like element)
- **THEN** its text is never transformed

#### Scenario: Advertisement copy untouched
- **WHEN** an element is identified as an advertisement or sponsored content
- **THEN** its text is never transformed

#### Scenario: Placeholder and label text untouched
- **WHEN** text is an input placeholder or a UI label
- **THEN** it is never transformed

### Requirement: Adapt to site structures
The extension SHALL adapt to different site structures without requiring site-specific code for every site.

#### Scenario: New site without code changes
- **WHEN** a user visits a site the extension has never been configured for
- **THEN** the extension falls back to generic content-detection heuristics rather than failing or applying no detection

#### Scenario: Per-site selector registry
- **WHEN** a site has an entry in the extension's selector registry (e.g. Facebook, Reddit)
- **THEN** the extension uses those selectors to improve detection and exclusion accuracy, and a new site's selectors can be added to the registry without changing the detection code
