## ADDED Requirements

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
