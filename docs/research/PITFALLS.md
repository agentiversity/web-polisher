# Domain Pitfalls

**Domain:** Browser extension that processes text with LLMs (text polisher)
**Researched:** 2026-07-26
**Confidence:** HIGH (Firefox-specific pitfalls from MDN official docs, LLM integration patterns from ecosystem knowledge)

## Critical Pitfalls

Mistakes that cause rewrites, broken functionality, or user-facing failures.

### Pitfall 1: Replacing text breaks page event handlers and React/Vue state

**What goes wrong:**
Directly setting `element.textContent` or `element.innerHTML` on user-generated content destroys event listeners, React/Vue fiber state, and framework-managed DOM references. Pages like Facebook and Reddit use React heavily — replacing text nodes breaks their virtual DOM reconciliation, causing UI glitches, lost form state, or infinite re-render loops.

**Why it happens:**
Content scripts see a "clean" DOM via Firefox's Xray vision, but the page's React/Vue still holds references to original DOM nodes. When you replace text content, React's fiber tree becomes stale. On next render cycle, React tries to update nodes that no longer match its virtual DOM, causing crashes or visual corruption.

**Consequences:**
- Comments disappear or duplicate on scroll
- "Reply" buttons stop working
- Form inputs lose focus or reset
- Page becomes unresponsive, user blames extension
- Users uninstall, leave negative reviews

**Prevention:**
- **Never replace entire elements.** Use `TreeWalker` to find text nodes only, then replace text content within those nodes. This preserves element references, attributes, and event listeners.
- **Clone before modifying:** If you must modify an element, clone it first, modify the clone, then use `replaceWith()`. But even this breaks framework state.
- **Test on React/Vue sites early.** Facebook, Reddit, Twitter all use frameworks. Test your text replacement on these in Phase 1.
- **Use MutationObserver defensively.** Watch for framework re-renders that overwrite your changes, and re-apply polishing if needed.

**Detection:**
- Comments vanish after scrolling
- Reply/edit buttons stop responding
- Console errors like "Cannot read property of null" from page's JavaScript
- Visual flickering as frameworks re-render over your changes

**Phase:** Roadmap Phase 1 (Foundation & Safe Text Replacement) — must get this right before anything else.

---

### Pitfall 2: LLM API latency causes janky scroll experience

**What goes wrong:**
LLM API calls take 1-3 seconds. If you block the main thread waiting for responses, or if you polish text as soon as it appears in DOM (before user scrolls to it), the page becomes sluggish. Users scroll through Facebook/Reddit quickly — if extension is busy polishing off-screen content, scroll performance degrades.

**Why it happens:**
- Synchronous API calls block main thread
- Polishing all comments on page load (even those 10 screens down) wastes API calls and CPU
- Not using IntersectionObserver to defer polishing until content is near viewport
- Not debouncing rapid scroll events

**Consequences:**
- Scroll jank, especially on long threads (Reddit comments can have 100+ replies)
- High API costs (polishing content user never sees)
- Battery drain on mobile
- Users disable extension due to performance impact

**Prevention:**
- **IntersectionObserver is mandatory.** Only polish content when it's within 200px of viewport (use `rootMargin: "200px 0px"` to pre-fetch).
- **Debounce scroll events.** Don't trigger polishing on every scroll tick — batch updates.
- **Queue API calls.** Limit concurrent LLM requests to 2-3 max. Use a priority queue (viewport-proximate content first).
- **Cache aggressively.** Same comment text = same polished result. Use `browser.storage.local` with content hash as key.
- **Abort on scroll-away.** If user scrolls past content before polishing completes, cancel the API call.

**Detection:**
- Scroll FPS drops below 30 on long pages
- Network tab shows dozens of simultaneous LLM API calls
- Extension memory usage grows unbounded (not caching results)
- Users report "browser feels slow with extension enabled"

**Phase:** Roadmap Phase 4 (Performance & Lazy Loading) — core to acceptable user experience.

---

### Pitfall 3: Polishing UI elements, navigation, or ads

**What goes wrong:**
Extension detects "text" and polishes it — but that text is a button label ("Post Comment"), navigation link ("Home"), or ad copy. Now UI is broken: buttons say "Submit Comment" instead of "Post Comment", links point to wrong places, ads show nonsensical text.

**Why it happens:**
Naive content detection (e.g., "find all `<p>` tags" or "all text nodes > 20 chars") catches UI elements. Sites mix user content and UI in same DOM tree. Facebook's "Write a comment..." placeholder, Reddit's "Reply" button, YouTube's "Subscribe" — all text, all should NOT be polished.

**Consequences:**
- UI becomes unusable (buttons unrecognizable)
- Users confused, think site is broken
- Immediate uninstall, 1-star review
- May violate site ToS (modifying their UI)

**Prevention:**
- **Site-specific selectors first.** For Facebook, target `[data-testid="comment"]` or `.userContent`. For Reddit, target `.md` inside comment containers. Don't rely on generic heuristics alone.
- **Whitelist approach.** Define CSS selectors for user content per site. Fall back to generic heuristics only on unknown sites.
- **Exclude known UI patterns.** Never polish: `<button>`, `<a>`, `<label>`, `<input placeholder>`, elements with `role="button"`, `role="link"`, `aria-label`, etc.
- **Confidence threshold.** If text is short (< 10 words) or contains UI keywords ("click", "submit", "menu"), skip it.
- **Visual diff testing.** Before shipping, screenshot pages with/without extension. If UI elements changed, fix selectors.

**Detection:**
- Buttons show polished text instead of original labels
- Navigation links have altered text
- Console errors from site's JavaScript (can't find expected button text)
- User reports: "I can't find the reply button"

**Phase:** Roadmap Phase 2 (Content Detection & Site Support) — fundamental to not breaking sites.

---

### Pitfall 4: Firefox MV3 content script CORS restrictions

**What goes wrong:**
Content script tries to call LLM API directly using `fetch()`, but Firefox MV3 enforces same-origin policy on content scripts. API calls to `api.openai.com` or `generativelanguage.googleapis.com` fail with CORS errors.

**Why it happens:**
In Firefox MV3 (and Chrome MV3), content scripts are subject to the page's CORS policy. They cannot make cross-origin requests unless the destination server opts in with CORS headers. LLM APIs don't set `Access-Control-Allow-Origin: *` for browser extensions.

**Consequences:**
- All LLM API calls fail silently or throw errors
- Extension appears broken, no text gets polished
- Users think extension doesn't work

**Prevention:**
- **Route API calls through background script.** Background scripts (service workers in MV3) have elevated cross-origin privileges. Content script sends text to background via `browser.runtime.sendMessage()`, background calls LLM API, returns polished text.
- **Use `browser.storage.local` for API keys.** Don't hardcode keys in content script — store in extension storage, access from background.
- **Test CORS early.** In Phase 3 (LLM integration), verify API calls work from background script before building content script logic.

**Detection:**
- Network tab shows CORS errors on LLM API calls
- Console: "Access to fetch at '...' has been blocked by CORS policy"
- Background script logs show successful API calls, but content script receives no response

**Phase:** Roadmap Phase 3 (LLM Transformation Engine) — architectural decision, must get right before building features.

---

### Pitfall 5: Confidence threshold too loose — makes text worse

**What goes wrong:**
Extension polishes text that was already fine, or "polishes" it into something worse. Example: original "gonna go to the store" becomes "I am going to proceed to the retail establishment" — overly formal, loses casual tone. Or: slang/idioms get mangled ("break a leg" → "fracture a limb").

**Why it happens:**
- Confidence threshold based only on LLM's self-reported confidence (often unreliable)
- No comparison between original and polished text
- Prompt doesn't preserve tone/style, just "fix grammar"
- Small/cheap LLMs (Gemini, Gemma) may not understand nuance

**Consequences:**
- Users notice text changed, don't like the changes
- Extension feels intrusive, not passive
- Loss of author's voice/style
- Users disable extension

**Prevention:**
- **Semantic similarity check.** Compare original and polished text using embeddings or simple metrics (word overlap, sentence structure). If similarity < 80%, abort.
- **Length check.** If polished text is > 20% longer or < 80% length of original, something went wrong — abort.
- **Tone preservation in prompt.** Explicitly instruct LLM: "Preserve the original tone (casual/formal/slang). Only improve grammar and naturalness, don't change style."
- **User feedback loop.** Allow users to flag bad polishes. Use this to tune threshold.
- **A/B test thresholds.** Start conservative (only polish obvious errors), gradually loosen based on user feedback.

**Detection:**
- Users report "text sounds weird" or "not like the original author"
- Polished text is significantly longer/shorter than original
- Casual comments become overly formal
- Idioms/slang get mangled

**Phase:** Roadmap Phase 5 (Quality & Confidence) — after core functionality works, refine threshold.

---

## Moderate Pitfalls

Mistakes that cause noticeable issues but not complete failure.

### Pitfall 6: Memory leaks from unbounded caching

**What goes wrong:**
Extension caches every polished comment in `browser.storage.local` or in-memory Map. After browsing Reddit for an hour, cache grows to thousands of entries, consuming 100+ MB RAM. Browser slows down, extension crashes.

**Why it happens:**
- No cache eviction policy
- Caching by full text content (long comments = large keys)
- Not using LRU (Least Recently Used) or TTL (Time To Live)

**Prevention:**
- **LRU cache with size limit.** Keep last 1000 entries max. Use a library or implement simple LRU.
- **Hash keys, not full text.** Cache by SHA-256 hash of text, not text itself. Saves storage space.
- **TTL eviction.** Expire entries after 7 days. Comments don't change often, but old cache entries waste space.
- **Monitor storage usage.** Use `browser.storage.local.getBytesInUse()` to track cache size. Alert user if > 50 MB.

**Detection:**
- Extension memory usage grows monotonically
- `browser.storage.local` exceeds 100 MB
- Browser becomes sluggish after extended use

**Phase:** Roadmap Phase 4 (Performance & Lazy Loading) — after MVP works, add cache management.

---

### Pitfall 7: Race conditions with lazy-loaded content

**What goes wrong:**
Facebook/Reddit use infinite scroll — new comments load as user scrolls. Extension's IntersectionObserver detects new comment, starts polishing. But before polishing completes, user scrolls away, comment gets removed from DOM (virtual scrolling), then re-added later. Extension tries to update text on stale DOM reference, fails silently or updates wrong element.

**Why it happens:**
- Virtual scrolling (React Virtualized, react-window) recycles DOM nodes
- Extension holds reference to DOM node that gets reused for different content
- No check that DOM node still contains original text before updating

**Prevention:**
- **Verify text before updating.** Before replacing text, check that current `textContent` matches original text you polished. If not, skip update.
- **Use WeakRef for DOM references.** Allows garbage collection if node is removed.
- **Re-observe on re-add.** Use MutationObserver to detect when elements are re-added to DOM, re-observe with IntersectionObserver.
- **Debounce updates.** If same element triggers multiple intersection events, batch into single update.

**Detection:**
- Wrong comment gets polished (text mismatch)
- Console errors: "Cannot read property 'textContent' of null"
- Comments flash between original and polished text

**Phase:** Roadmap Phase 4 (Performance & Lazy Loading) — after basic lazy loading works, handle edge cases.

---

### Pitfall 8: API key exposure in extension package

**What goes wrong:**
Developer hardcodes LLM API key in content script or background script. User downloads extension, extracts source, finds API key. Now anyone can use developer's API quota, racking up costs.

**Why it happens:**
- Convenience during development
- Not understanding that extension source is visible to users
- Thinking "obfuscation" is enough (it's not)

**Consequences:**
- API costs spike (others use your key)
- API provider suspends key
- Security incident, must rotate keys

**Prevention:**
- **User provides own API key.** Extension has settings page where user enters their API key. Store in `browser.storage.local` (encrypted if possible).
- **No hardcoded keys.** Never commit API keys to source control. Use `.env` files for local dev, but don't bundle in extension.
- **Proxy through your server (optional).** If you want to provide API access, route calls through your backend where you can rate-limit and authenticate. But this adds cost/complexity — prefer user-provided keys for MVP.

**Detection:**
- API usage dashboard shows requests from unknown IPs
- API provider alerts on unusual usage patterns
- Users report "my API key stopped working" (because you revoked exposed key)

**Phase:** Roadmap Phase 3 (LLM Transformation Engine) — must decide architecture early.

---

## Minor Pitfalls

Small issues that cause polish problems but not failures.

### Pitfall 9: Not handling offline/airplane mode gracefully

**What goes wrong:**
User goes offline. Extension tries to call LLM API, fails with network error. Shows error message or hangs, leaving comments in half-polished state.

**Prevention:**
- **Detect offline state.** Use `navigator.onLine` and `browser.runtime.onConnect` to detect connectivity.
- **Fail silently.** If offline, skip polishing. Don't show error messages — extension is supposed to be passive.
- **Queue for later (optional).** Cache unpolished text, polish when back online. But this adds complexity — for MVP, just skip.

**Phase:** Roadmap Phase 5 (Quality & Confidence) — after core flow works.

---

### Pitfall 10: Polishing same text multiple times

**What goes wrong:**
User scrolls past comment, extension polishes it. User scrolls back, IntersectionObserver fires again, extension polishes same text again. Wastes API calls, may produce slightly different result (LLM non-determinism), causing text to "flicker".

**Prevention:**
- **Mark polished elements.** Add `data-polished="true"` attribute after polishing. Check before re-polishing.
- **Cache by content hash.** If text hasn't changed, use cached result.
- **Debounce intersection events.** Only trigger polishing once per element, even if intersection fires multiple times.

**Phase:** Roadmap Phase 4 (Performance & Lazy Loading) — simple fix, do it right first time.

---

### Pitfall 11: Firefox-specific: content script lifecycle during navigation

**What goes wrong:**
In Firefox, content scripts remain injected after user navigates away (unlike Chrome which destroys them). If user navigates back, content script's `window` properties are lost. Extension state stored in `window.myVar` becomes `undefined`.

**Why it happens:**
Firefox bug 1525400 — content scripts persist but window properties don't.

**Prevention:**
- **Use `browser.storage.session` for state.** Persists across navigation within same tab.
- **Listen to `pageshow`/`pagehide` events.** Re-initialize state on `pageshow`.
- **Don't rely on global variables.** Use module-scoped variables or `browser.storage`.

**Detection:**
- Extension works on first page load, breaks after navigation
- Console: "myVar is undefined" after navigating back

**Phase:** Roadmap Phase 1 (Foundation & Safe Text Replacement) — handle early to avoid confusion.

---

> Phase labels below map each pitfall to the **authoritative 5-phase roadmap** (ROADMAP.md).
> Earlier drafts used an ad-hoc "Phase 1 / Phase 2" scheme; those phase numbers are superseded.

## Phase-Specific Warnings

| Roadmap Phase | Likely Pitfall | Mitigation |
|---------------|---------------|------------|
| **Phase 1: Foundation & Safe Text Replacement** | Breaking React/Vue state (#1) | Use TreeWalker on text nodes only, test on Facebook/Reddit early |
| **Phase 1: Foundation & Safe Text Replacement** | Navigation lifecycle (#11) | Use `browser.storage.session`, listen to pageshow/pagehide |
| **Phase 2: Content Detection & Site Support** | Polishing UI elements (#3) | Site-specific selectors, exclude buttons/links/labels |
| **Phase 3: LLM Transformation Engine** | CORS restrictions (#4) | Route API calls through background script |
| **Phase 3: LLM Transformation Engine** | API key exposure (#8) | User-provided keys in settings, no hardcoded secrets |
| **Phase 4: Performance & Lazy Loading** | Janky scroll (#2) | IntersectionObserver with rootMargin, debounce scroll events |
| **Phase 4: Performance & Lazy Loading** | Duplicate polishing (#10) | Mark polished elements, cache by content hash |
| **Phase 4: Performance & Lazy Loading** | Memory leaks (#6) | LRU cache with size limit, TTL eviction |
| **Phase 4: Performance & Lazy Loading** | Race conditions (#7) | Verify text before updating, use WeakRef, re-observe on re-add |
| **Phase 5: Quality & Confidence** | Confidence threshold too loose (#5) | Semantic similarity check, length check, tone preservation in prompt |
| **Phase 5: Quality & Confidence** | Offline mode (#9) | Detect offline, fail silently, skip polishing |

## Sources

- MDN Content Scripts documentation (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts) — HIGH confidence
- MDN Chrome Incompatibilities (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities) — HIGH confidence
- MDN Intersection Observer API (https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) — HIGH confidence
- Firefox extension development best practices — MEDIUM confidence (training data)
- LLM API integration patterns — MEDIUM confidence (training data, ecosystem knowledge)
- React/Vue DOM manipulation pitfalls — HIGH confidence (well-documented in ecosystem)
