## MODIFIED Requirements

### Requirement: Abort below confidence threshold
The extension SHALL abort transformations whose confidence score is below a configurable threshold.

#### Scenario: Low-confidence transform rejected
- **WHEN** the computed confidence score for a transformation is below the configured threshold
- **THEN** the original text is kept and no transformation is applied

#### Scenario: Threshold is tunable
- **WHEN** a user adjusts the confidence threshold in the options page or the action popup
- **THEN** the extension applies the new threshold to subsequent transformations, clamped to a 0–90 range so a too-strict setting cannot silently disable rewriting, with a conservative default (50), persisted in `browser.storage.local`
