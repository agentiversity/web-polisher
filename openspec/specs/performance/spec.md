## Purpose
Lazy-load text transformations so pages remain fast and responsive, processing user content only as it approaches the viewport and gracefully handling the 1-2 second LLM latency without perceived sluggishness.

## Requirements

### Requirement: Lazy-load transformations
The extension SHALL process user-generated content only as it approaches or enters the viewport.

#### Scenario: Off-screen content deferred
- **WHEN** a page contains many comments below the visible area
- **THEN** those comments are not transformed until the user scrolls near them

#### Scenario: Viewport-adjacent pre-fetch
- **WHEN** content comes within a short distance of the viewport
- **THEN** the extension begins transforming it ahead of it being fully visible

### Requirement: Handle transformation delay gracefully
The extension SHALL handle the 1-2 second transformation delay without perceived sluggishness.

#### Scenario: Delay without jank
- **WHEN** a transformation takes up to a couple of seconds
- **THEN** the page remains responsive and scrollable and the original text is shown until the polished result arrives

### Requirement: Prevent page slowdown
The extension SHALL prevent page slowdown caused by heavy transformation activity.

#### Scenario: Long thread performance
- **WHEN** a page contains hundreds of user comments
- **THEN** the extension limits concurrent API calls and avoids scroll jank, so the page stays responsive

#### Scenario: Duplicate processing prevention
- **WHEN** the same text is encountered more than once (re-scroll or re-add)
- **THEN** the extension reuses cached results or skips already-processed content rather than re-transforming it
