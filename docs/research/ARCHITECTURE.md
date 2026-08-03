# Architecture Patterns

**Domain:** Firefox browser extension for passive text polishing
**Researched:** 2026-07-26

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Firefox Extension                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌──────────────────┐              │
│  │   manifest   │         │   Background      │              │
│  │    .json     │────────▶│   Service Worker  │              │
│  └──────────────┘         │   (Event Page)    │              │
│                            └────────┬─────────┘              │
│                                     │                         │
│                            Message Passing                    │
│                                     │                         │
│  ┌──────────────────────────────────▼────────────────────┐  │
│  │              Content Script (per tab)                  │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │   Content   │  │   Lazy Load  │  │   DOM       │  │  │
│  │  │  Detector   │  │  Observer    │  │  Replacer   │  │  │
│  │  └─────────────┘  └──────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                     │                         │
│                            ┌────────▼─────────┐              │
│                            │   LLM API        │              │
│                            │   (External)     │              │
│                            └──────────────────┘              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **manifest.json** | Extension metadata, permissions, script registration | Browser runtime |
| **Background Service Worker** | LLM API calls, caching, state management, confidence threshold logic | Content scripts (via messages), LLM APIs (via fetch) |
| **Content Script** | DOM access, text detection, lazy loading, text replacement | Background worker (via messages), Page DOM |
| **Content Detector** (subcomponent) | Identify user-generated content vs UI elements | Content Script |
| **Lazy Load Observer** (subcomponent) | IntersectionObserver for viewport-based processing | Content Script |
| **DOM Replacer** (subcomponent) | Safe text replacement preserving structure | Content Script |

### Data Flow

**Passive polishing flow:**

1. **Page Load** → Browser injects content script (per manifest `content_scripts` matches)
2. **Content Detection** → Content script scans DOM for user-generated content (comments, posts)
3. **Lazy Load Trigger** → IntersectionObserver detects element entering viewport
4. **Text Extraction** → Content script extracts text from target elements
5. **Message to Background** → `browser.runtime.sendMessage({ type: 'polish', text, elementId })`
6. **Cache Check** → Background checks if text already polished (hash-based cache)
7. **LLM API Call** → If not cached, background calls Gemini/Gemma API with polish prompt
8. **Confidence Check** → Background evaluates transformation confidence score
9. **Response** → Background sends polished text back (or abort signal if low confidence)
10. **DOM Replacement** → Content script replaces original text with polished version
11. **Visual Feedback** → Optional subtle indicator (e.g., tooltip on hover)

**Key data structures:**

```typescript
// Message: Content Script → Background
interface PolishRequest {
  type: 'polish';
  text: string;
  elementId: string;  // For tracking which element to update
  context?: string;   // Optional: surrounding context
}

// Message: Background → Content Script
interface PolishResponse {
  success: boolean;
  polishedText?: string;
  confidence?: number;  // 0-1 score
  abortReason?: 'low_confidence' | 'api_error' | 'rate_limit';
}

// Cache entry (in background storage)
interface CacheEntry {
  hash: string;        // SHA-256 of original text
  polished: string;
  confidence: number;
  timestamp: number;
  model: string;       // Which LLM was used
}
```

## Patterns to Follow

### Pattern 1: Manifest V3 Event Page (Non-Persistent Background)

**What:** Background service worker that unloads when idle, wakes on events
**When:** Always for MV3 extensions — required by Firefox/Chrome
**Example:**
```json
// manifest.json
{
  "manifest_version": 3,
  "background": {
    "scripts": ["background.js"],
    "type": "module"
  },
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "*://*.facebook.com/*",
    "*://*.reddit.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["*://*/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

**Why:** Non-persistent background reduces memory footprint. State must be persisted to `storage.local` or `storage.session` since background can unload.

### Pattern 2: Message Passing with Ports for Streaming

**What:** Long-lived connection for multiple messages (e.g., streaming LLM responses)
**When:** When exchanging multiple messages or need progress updates
**Example:**
```javascript
// Content script
const port = browser.runtime.connect({ name: 'polish-session' });
port.postMessage({ type: 'polish', text: '...' });
port.onMessage.addListener((msg) => {
  if (msg.type === 'progress') updateUI(msg.progress);
  if (msg.type === 'result') replaceText(msg.text);
});

// Background
browser.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'polish') {
      const stream = await callLLM(msg.text);
      for await (const chunk of stream) {
        port.postMessage({ type: 'progress', progress: chunk });
      }
      port.postMessage({ type: 'result', text: finalText });
    }
  });
});
```

**Why:** One-off messages (`sendMessage`) are fine for single request/response. Ports are better for streaming or multiple exchanges.

### Pattern 3: IntersectionObserver for Lazy Loading

**What:** Process content only when it enters viewport
**When:** Pages with many comments/posts (Reddit, Facebook feeds)
**Example:**
```javascript
// Content script
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const element = entry.target;
      if (!element.dataset.polished) {
        polishElement(element);
        element.dataset.polished = 'true';
      }
      observer.unobserve(element);  // Stop observing once processed
    }
  });
}, { rootMargin: '100px' });  // Start 100px before viewport

// Observe all comment elements
document.querySelectorAll('.comment, .post').forEach((el) => {
  observer.observe(el);
});
```

**Why:** Avoids processing hundreds of comments on page load. Reduces API calls and improves perceived performance.

### Pattern 4: Content Detection Heuristics

**What:** Identify user-generated content vs UI elements
**When:** Must distinguish comments/posts from navigation, ads, buttons
**Example:**
```javascript
function isUserContent(element) {
  // Positive signals
  const positiveSelectors = [
    '[data-testid="comment"]',
    '.comment-body',
    '.post-content',
    '[role="article"]',
    '.user-content'
  ];
  
  // Negative signals
  const negativeSelectors = [
    'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]',
    '.ad', '.advertisement', 'button', 'a[href]'
  ];
  
  // Check negative first
  if (element.matches(negativeSelectors.join(','))) return false;
  
  // Check positive
  if (element.matches(positiveSelectors.join(','))) return true;
  
  // Heuristic: long text content, not interactive
  const text = element.textContent.trim();
  return text.length > 50 && !element.querySelector('button, input, select');
}
```

**Why:** Site-specific selectors break. Combine with heuristics for robustness. Test on target sites (Facebook, Reddit).

### Pattern 5: Safe DOM Text Replacement

**What:** Replace text without breaking event handlers or structure
**When:** Modifying page content
**Example:**
```javascript
function replaceText(element, newText) {
  // Store original for potential restore
  const original = element.innerHTML;
  element.dataset.originalHtml = original;
  
  // Replace text nodes only, preserve child elements
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.trim()) {
      node.textContent = newText;  // Simplified — real impl needs mapping
      break;  // One replacement per element
    }
  }
}
```

**Why:** `element.textContent = newText` destroys child elements. TreeWalker preserves structure.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Persistent Background Script

**What:** `"persistent": true` in manifest (MV2) or keeping state in memory (MV3)
**Why bad:** MV3 requires non-persistent background. Memory state lost on unload.
**Instead:** Use `browser.storage.session` for in-memory state, `browser.storage.local` for persistent state. Always read/write storage, never rely on globals.

### Anti-Pattern 2: Processing All Content on Load

**What:** Querying all comments/posts and polishing immediately
**Why bad:** Hundreds of API calls, slow page load, rate limits hit
**Instead:** IntersectionObserver for lazy loading. Process only visible content.

### Anti-Pattern 3: Direct DOM Manipulation Without Isolation

**What:** Content script accessing page JavaScript variables
**Why bad:** Firefox's Xray vision prevents this. Page scripts can't see content script variables either.
**Instead:** Use `window.postMessage` for content script ↔ page communication. Use `browser.runtime.sendMessage` for content script ↔ background communication.

### Anti-Pattern 4: Synchronous LLM Calls

**What:** Blocking content script while waiting for LLM response
**Why bad:** Freezes UI, bad UX, 1-2 second delays feel like forever
**Instead:** Async message passing. Show subtle loading indicator if needed. Replace text when response arrives.

### Anti-Pattern 5: Hardcoded Site Selectors

**What:** `document.querySelectorAll('.facebook-comment')`
**Why bad:** Breaks when site changes DOM structure. Doesn't work on other sites.
**Instead:** Combine site-specific selectors with generic heuristics. Make selectors configurable. Test on multiple sites.

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| **LLM API costs** | Manageable with small models (Gemini Flash) | Need caching, batching, rate limiting | Consider local models, edge caching, tiered pricing |
| **Content script performance** | Fine with IntersectionObserver | Must debounce, batch API calls | Consider Web Workers for heavy processing |
| **Cache size** | `storage.local` sufficient (5MB limit) | Need eviction strategy, LRU cache | Consider IndexedDB for larger cache |
| **Rate limits** | LLM API rate limits manageable | Need request queuing, backoff | Distributed rate limiting, multiple API keys |
| **Site compatibility** | Test on Facebook, Reddit | Need site-specific adapters, fallback heuristics | Community-contributed selectors, ML-based detection |

## Build Order (Dependencies)

> Phase numbering below matches the authoritative roadmap (ROADMAP.md — 5 phases). Iterations within a phase are sequential work items, not separate phases.

**Phase 1: Foundation & Safe Text Replacement**
1. WXT scaffold: `manifest.json` with basic permissions, empty background service worker, empty content script
2. TreeWalker-based safe text replacement (preserve React fiber state)
3. Content script ↔ background message-passing skeleton
4. Test: Extension loads, scripts inject; text replaced without breaking page on Facebook/Reddit

**Phase 2: Content Detection & Site Support**
1. Content detector with site-specific selectors (Facebook, Reddit)
2. Exclusion rules (filter out UI, navigation, ads)
3. Heuristic fallback for generic sites
4. Test: Correctly identifies comments vs UI on target sites

**Phase 3: LLM Transformation Engine**
1. Background worker with LLM API client (Gemini Flash)
2. Message passing: content script → background → content script
3. Naturalness polish prompt + API key management (settings)
4. Test: Text sent to LLM, response received

**Phase 4: Performance & Lazy Loading**
1. IntersectionObserver integration (200px rootMargin)
2. Dynamic content detection (MutationObserver for infinite scroll)
3. Concurrent request limiting (max 2-3) + LRU cache (1k entries, 7-day TTL)
4. Test: Comments polished as scrolled into view without page slowdown

**Phase 5: Quality & Confidence**
1. Confidence scoring (semantic similarity, length preservation)
2. Quality gate (abort below threshold) + error/offline handling (fail silently)
3. Threshold tuning mechanism (settings)
4. Test: Low-confidence transformations aborted, original text shown on failure

## Sources

- MDN Web Docs: Firefox Extension API (manifest.json, content scripts, background scripts)
- MDN Web Docs: Message passing, storage API
- Intersection Observer API specification
- Gemini API documentation (for LLM integration patterns)
