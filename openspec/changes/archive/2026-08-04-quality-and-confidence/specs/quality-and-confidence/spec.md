## Purpose
Guarantee transformation quality by aborting below-confidence transformations and evaluating quality before any change is applied to the page, so that poor transformations are never worse than leaving text alone.

## MODIFIED Requirements

### Requirement: Abort below confidence threshold
The extension SHALL abort transformations whose confidence score is below a configurable threshold.

#### Scenario: Low-confidence transform rejected
- **WHEN** the computed confidence score for a transformation is below the configured threshold
- **THEN** the original text is kept and no transformation is applied

#### Scenario: Threshold is tunable
- **WHEN** a user adjusts the confidence threshold in the options page
- **THEN** the extension applies the new threshold to subsequent transformations, with a conservative default (50/100), persisted in `browser.storage.local`

### Requirement: Evaluate quality before applying
The extension SHALL evaluate transformation quality before applying the change to the page.

#### Scenario: Quality gate on polished output
- **WHEN** the LLM produces a polished result
- **THEN** the extension evaluates the output — token-overlap similarity to the original plus length fidelity — before returning it for application, without any additional LLM call

#### Scenario: Failed quality gate shows original
- **WHEN** a polished result fails the quality gate (similarity below the threshold or length ratio out of bounds)
- **THEN** the page continues to show the original text rather than the rejected result
