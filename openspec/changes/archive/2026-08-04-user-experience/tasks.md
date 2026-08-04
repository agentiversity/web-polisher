## 1. Initial feedback on trigger

- [x] 1.1 Add a brief "Polishing…" modal overlay in the content script, shown when `apply-polish` arrives and removed once the initial pass settles
- [x] 1.2 Ensure the modal never appears on page load (only after the action button is clicked)

## 2. Highlight changed text with original on hover

- [x] 2.1 Wrap applied rewrites in a highlighted `<span class="text-polished">` (light-blue, rounded)
- [x] 2.2 Set the span's `title` to the original text so a native tooltip shows what changed
- [x] 2.3 Skip the highlight (and the write) when the rewrite is not meaningfully different from the original

## 3. Remain quiet after trigger

- [x] 3.1 Show no per-item popups, dialogs, or confirmations while results are applied
- [x] 3.2 Keep all failure paths silent: a failed/rejected transformation leaves the original text and surfaces no error UI

## 4. Verification

- [x] 4.1 Confirm explicit-trigger contract and highlight behavior in the E2E harness (Chrome + real Firefox)
- [x] 4.2 Confirm re-click is idempotent and no UI regressions
