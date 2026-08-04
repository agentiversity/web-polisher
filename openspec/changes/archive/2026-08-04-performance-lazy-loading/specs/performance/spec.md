## MODIFIED Requirements

### Requirement: Lazy-load transformations
After the user triggers polishing, the extension SHALL transform user-generated content as it approaches or enters the viewport, starting with content currently in or near view.

#### Scenario: Content in view transforms first
- **WHEN** the user triggers polishing
- **THEN** user-generated content currently in or near the viewport is transformed immediately

#### Scenario: Off-screen content deferred
- **WHEN** a page contains many comments below the visible area
- **THEN** those comments are not transformed until the user scrolls near them

#### Scenario: Viewport-adjacent pre-fetch
- **WHEN** content comes within a short distance of the viewport
- **THEN** the extension begins transforming it ahead of it being fully visible

### Requirement: Handle transformation delay gracefully
The extension SHALL handle the transformation delay without perceived sluggishness.

#### Scenario: Delay without jank
- **WHEN** a transformation takes up to a couple of seconds
- **THEN** the page remains responsive and scrollable and no DOM writes occur during active scrolling

#### Scenario: Original shown until result arrives
- **WHEN** a text node is awaiting its polished result
- **THEN** the page continues to show the original text until the result is applied

### Requirement: Prevent page slowdown
The extension SHALL prevent page slowdown caused by heavy transformation activity.

#### Scenario: Long thread performance
- **WHEN** a page contains hundreds of user comments
- **THEN** the extension processes transformations in bounded sequential batches and avoids scroll jank, so the page stays responsive

#### Scenario: Duplicate processing prevention
- **WHEN** the same text is encountered more than once (re-scroll or re-add)
- **THEN** the extension reuses the previously polished result from a bounded, time-limited cache or skips already-processed content rather than re-transforming it

## ADDED Requirements

### Requirement: Transform dynamically mounted content
After the user triggers polishing, the extension SHALL transform user-generated content that is mounted after the trigger (e.g. infinite scroll, virtualization) once it approaches or enters the viewport.

#### Scenario: New content picked up after trigger
- **WHEN** new user-generated content is added to the page after polishing was triggered
- **THEN** the extension detects it and transforms it as it approaches the viewport

#### Scenario: Virtualized content transformed once
- **WHEN** content is removed from and re-added to the DOM (virtualized feed scrolling)
- **THEN** the extension transforms it at most once per polished state and reuses the cached result rather than re-calling the LLM
