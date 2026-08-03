## Purpose
Automatically identify user-generated content (comments and posts) on web pages and reliably exclude UI elements, navigation, and ads, so the extension only ever polishes real user content.

## Requirements

### Requirement: Detect user-generated content
The extension SHALL detect user-generated content (comments and posts) on web pages.

#### Scenario: Comment detection on a feed
- **WHEN** a page contains a feed of user comments in common container types (e.g. articles, comment bodies, post content)
- **THEN** the extension identifies each comment as user-generated content eligible for transformation

#### Scenario: Post detection
- **WHEN** a page contains a user-authored post
- **THEN** the extension identifies the post's body text as user-generated content

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

### Requirement: Handle dynamic content
The extension SHALL handle user-generated content that is added to the page after the initial load (infinite scroll, lazy loading).

#### Scenario: Infinite scroll additions
- **WHEN** new comments or posts are added to the DOM after initial page load
- **THEN** the extension detects them and treats them the same as initially-loaded content

#### Scenario: Recurring content
- **WHEN** a previously loaded element is re-observed through virtual scrolling
- **THEN** the extension avoids duplicate processing and does not rewrite content that has changed

### Requirement: Generic site support
The extension SHALL work on generic web pages with user-generated content across different site structures.

#### Scenario: Unrecognized site
- **WHEN** the current site is not one with predefined support (neither Facebook nor Reddit)
- **THEN** the extension still detects and transforms user-generated content using generic heuristics

#### Scenario: Known sites
- **WHEN** the current site is a supported site (Facebook or Reddit)
- **THEN** the extension uses site-specific selectors to improve detection accuracy

### Requirement: Adapt to site structures
The extension SHALL adapt to different site structures without requiring site-specific code for every site.

#### Scenario: New site without code changes
- **WHEN** a user visits a site the extension has never been configured for
- **THEN** the extension falls back to generic content-detection heuristics rather than failing or applying no detection

#### Scenario: Per-site selector registry
- **WHEN** a site has an entry in the extension's selector registry (e.g. Facebook, Reddit)
- **THEN** the extension uses those selectors to improve detection and exclusion accuracy, and a new site's selectors can be added to the registry without changing the detection code
