## MODIFIED Requirements

### Requirement: Operate invisibly
The extension SHALL operate invisibly once the user has triggered polishing, with no awareness that transformation is occurring.

#### Scenario: Seamless reading after trigger
- **WHEN** the user has triggered polishing and then reads a page containing user-generated content
- **THEN** polished text appears seamlessly and the user is not made aware of further per-item intervention

## REMOVED Requirements

### Requirement: Transform silently without UI triggers
**Reason**: Replaced by the explicit on-demand model. The extension is now off by default and only runs after the user clicks the action button (see `user-actions` capability); "always-on silent transformation with no trigger" no longer applies.
**Migration**: Users apply polishing intentionally via the action button. This behavior is covered by the new `user-actions` capability.

## ADDED Requirements

### Requirement: Require explicit trigger before transformation
The extension SHALL NOT transform page content until the user explicitly triggers it via the action button.

#### Scenario: No trigger, no transformation
- **WHEN** a page loads without the user activating the action button
- **THEN** the extension does not transform any text on that page

#### Scenario: Silent on failure
- **WHEN** a triggered transformation fails or is rejected (e.g. offline, low confidence, API error)
- **THEN** the extension does not surface an error to the user and simply leaves the original text unchanged
